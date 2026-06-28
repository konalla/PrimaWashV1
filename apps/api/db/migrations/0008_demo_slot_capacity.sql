update availability_slots
set capacity = 50
where id in ('slot_demo_0900', 'slot_demo_1100')
  and capacity < 50;
