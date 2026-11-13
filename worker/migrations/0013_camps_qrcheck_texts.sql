-- Plain-language descriptions for the two example checks (only rows an admin has not edited are touched).
UPDATE camp_qr_checks SET description = 'ตรวจ QR และข้อมูลของนักศึกษา'
  WHERE name = 'ตรวจครั้งที่ 1' AND description = 'ตรวจ QR และข้อมูลนักศึกษาจากฐานข้อมูลลงทะเบียน';
UPDATE camp_qr_checks SET description = 'เทียบป้ายของนักศึกษากับชื่อ AKA ที่นักศึกษาตั้งไว้'
  WHERE name = 'ตรวจสอบป้ายกับ AKA' AND description = 'เทียบป้ายของนักศึกษากับข้อมูลในระบบ AKA (ระบบในอนาคต: ตอนนี้บันทึกผลด้วยมือ)';
