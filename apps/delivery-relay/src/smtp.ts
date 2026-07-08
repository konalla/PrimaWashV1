import net from "node:net";
import tls from "node:tls";

export interface SmtpMessage {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username?: string;
  readonly password?: string;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly timeoutMs: number;
}

export async function sendSmtpMessage(message: SmtpMessage): Promise<void> {
  const client = await SmtpClient.connect(message.host, message.port, message.secure, message.timeoutMs);

  try {
    await client.expect(220);
    await client.command(`EHLO ${smtpHostName()}`, 250);

    if (!message.secure) {
      const startTlsResponse = await client.command("STARTTLS", [220, 500, 502, 504]);

      if (startTlsResponse.startsWith("220")) {
        client.upgradeToTls(message.host);
        await client.command(`EHLO ${smtpHostName()}`, 250);
      } else if (message.username || message.password) {
        throw new Error("smtp_starttls_unavailable");
      }
    }

    if (message.username && message.password) {
      const token = Buffer.from(`\0${message.username}\0${message.password}`, "utf8").toString("base64");
      await client.command(`AUTH PLAIN ${token}`, 235);
    }

    await client.command(`MAIL FROM:<${message.from}>`, 250);
    await client.command(`RCPT TO:<${message.to}>`, [250, 251]);
    await client.command("DATA", 354);
    await client.writeData(renderEmail(message));
    await client.expect(250);
    await client.command("QUIT", 221);
  } finally {
    client.close();
  }
}

class SmtpClient {
  private buffer = "";
  private pending:
    | {
        readonly resolve: (line: string) => void;
        readonly reject: (error: Error) => void;
        readonly timer: NodeJS.Timeout;
      }
    | undefined;

  private constructor(
    private socket: net.Socket | tls.TLSSocket,
    private readonly timeoutMs: number,
  ) {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(String(chunk)));
    this.socket.on("error", (error) => this.fail(error instanceof Error ? error : new Error(String(error))));
    this.socket.on("close", () => this.fail(new Error("smtp_connection_closed")));
  }

  static connect(host: string, port: number, secure: boolean, timeoutMs: number): Promise<SmtpClient> {
    return new Promise((resolve, reject) => {
      const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("smtp_connection_timeout"));
      }, timeoutMs);

      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(new SmtpClient(socket, timeoutMs));
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  upgradeToTls(host: string): void {
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("close");
    this.buffer = "";
    this.socket = tls.connect({
      socket: this.socket,
      servername: host,
    });
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(String(chunk)));
    this.socket.on("error", (error) => this.fail(error instanceof Error ? error : new Error(String(error))));
    this.socket.on("close", () => this.fail(new Error("smtp_connection_closed")));
  }

  async command(command: string, expectedCodes: number | readonly number[]): Promise<string> {
    this.socket.write(`${command}\r\n`);
    return this.expect(expectedCodes);
  }

  async writeData(data: string): Promise<void> {
    this.socket.write(`${escapeData(data)}\r\n.\r\n`);
  }

  expect(expectedCodes: number | readonly number[]): Promise<string> {
    const expected = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        reject(new Error("smtp_response_timeout"));
      }, this.timeoutMs);

      this.pending = {
        resolve: (line) => {
          const code = Number.parseInt(line.slice(0, 3), 10);
          if (!expected.includes(code)) {
            reject(new Error(`smtp_unexpected_response:${line}`));
            return;
          }

          resolve(line);
        },
        reject,
        timer,
      };
      this.flushLine();
    });
  }

  close(): void {
    this.socket.destroy();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    this.flushLine();
  }

  private flushLine(): void {
    if (!this.pending) {
      return;
    }

    const completeLines = this.buffer.split(/\r?\n/).filter(Boolean);
    const finalLine = [...completeLines].reverse().find((line: string) => /^\d{3} /.test(line));

    if (!finalLine) {
      return;
    }

    this.buffer = "";
    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve(finalLine);
  }

  private fail(error: Error): void {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

function renderEmail(message: SmtpMessage): string {
  return [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.text,
  ].join("\r\n");
}

function escapeData(data: string): string {
  return data
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function smtpHostName(): string {
  return "prima-wash-delivery-relay.local";
}
