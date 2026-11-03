/**
 * สร้าง Google Form แบบสอบถาม AHP (D-56)
 *
 * วิธีใช้: เปิด https://script.google.com → New project → วางไฟล์นี้ทั้งไฟล์ → เลือก createAhpForm → Run
 * (ครั้งแรก Google จะขอสิทธิ์สร้างฟอร์มในบัญชีของผู้รัน) · ลิงก์ฟอร์มและลิงก์แก้ไขจะแสดงใน Execution log
 *
 * ปัจจัยและลำดับคู่ต้องตรงกับ FACTORS / pair_keys() ใน ahp.py
 * สเกลและคำถามตาม R.W. Saaty (1987): Table 1 น. 163, รูปแบบคำถาม น. 164
 */

const FACTORS = [
  { key: 'category', name: 'หมวดหมู่', detail: 'สถานที่ตรงกับประเภทที่อยากไป (เช่น วัด น้ำตก พิพิธภัณฑ์)' },
  { key: 'rating', name: 'คะแนนรีวิว', detail: 'คะแนนรีวิวของสถานที่บน Google Maps' },
  { key: 'distance', name: 'ระยะทาง', detail: 'ระยะทางตามถนนจากจุดเริ่มต้นของการเดินทาง' },
  { key: 'budget', name: 'ราคาเทียบงบ', detail: 'ค่าใช้จ่ายต่อคนของสถานที่ เทียบกับงบต่อคนต่อวันที่ตั้งไว้' },
  { key: 'weather', name: 'สภาพอากาศ', detail: 'ความเหมาะสมกับโอกาสฝนตกในวันที่ไป (สถานที่กลางแจ้งได้รับผลจากฝน สถานที่ในร่มไม่ได้รับผล)' },
];

// ความหมายของระดับ — Saaty 1987 Table 1 น. 163 (2, 4, 6, 8 เป็นค่ากลาง)
const SCALE_TEXT =
  '1 = สำคัญเท่ากัน\n' +
  '3 = สำคัญกว่าเล็กน้อย\n' +
  '5 = สำคัญกว่าชัดเจน\n' +
  '7 = สำคัญกว่ามาก\n' +
  '9 = สำคัญกว่าอย่างยิ่ง\n' +
  '2, 4, 6, 8 = ใช้เมื่อรู้สึกว่าอยู่ระหว่างสองระดับ (เช่น มากกว่าเล็กน้อย แต่ยังไม่ถึงชัดเจน → 4)';

function createAhpForm() {
  const form = FormApp.create('แบบสอบถาม: ความสำคัญของปัจจัยในการเลือกสถานที่ท่องเที่ยว');
  form.setDescription(
    'แบบสอบถามนี้เป็นส่วนหนึ่งของโครงงาน E-tinerary (ระบบช่วยวางแผนการเดินทางท่องเที่ยวในประเทศไทย) ' +
    'ใช้หาว่าผู้ใช้ให้ความสำคัญกับแต่ละปัจจัยมากน้อยเพียงใดเมื่อเลือกสถานที่ท่องเที่ยว\n\n' +
    'มีคำถามเปรียบเทียบ 10 ข้อ · ไม่เก็บชื่อหรืออีเมล · ข้อมูลใช้เพื่อโครงงานนี้เท่านั้น'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);

  // ส่วนที่ 1 ข้อมูลผู้ตอบ
  form.addSectionHeaderItem().setTitle('ส่วนที่ 1 ข้อมูลผู้ตอบ');
  form.addMultipleChoiceItem()
    .setTitle('คุณเคยวางแผนเที่ยวในประเทศไทยด้วยตัวเองหรือไม่')
    .setChoiceValues(['เคย', 'ไม่เคย'])
    .setRequired(true);
  form.addTextItem()
    .setTitle('ใน 1 ปีที่ผ่านมา คุณเที่ยวในประเทศไทยประมาณกี่ครั้ง (ตอบเป็นตัวเลข)')
    .setValidation(FormApp.createTextValidation().requireNumberGreaterThanOrEqualTo(0).build())
    .setRequired(true);

  // ส่วนที่ 2 คำอธิบาย
  form.addPageBreakItem().setTitle('ส่วนที่ 2 ปัจจัยที่ใช้เลือกสถานที่ท่องเที่ยว');
  form.addSectionHeaderItem()
    .setTitle('ระบบให้คะแนนสถานที่จาก 5 ปัจจัยนี้')
    .setHelpText(FACTORS.map(f => `• ${f.name}: ${f.detail}`).join('\n'));
  form.addSectionHeaderItem()
    .setTitle('วิธีตอบ')
    .setHelpText(
      'ลองนึกว่าคุณกำลังเลือกว่าจะไปเที่ยวสถานที่ไหน แล้วต้องชั่งใจระหว่าง 2 เรื่อง\n\n' +
      'หน้าถัดไปมี 10 หน้า หน้าละ 1 คู่ ตอบหน้าละ 2 ข้อ\n' +
      '  ข้อแรก: เลือกว่าเรื่องไหน "สำคัญกว่า" สำหรับคุณ\n' +
      '  ข้อสอง: เลือกเลข 1–9 ว่าสำคัญกว่า "มากแค่ไหน"\n\n' +
      'ความหมายของเลข\n' +
      SCALE_TEXT + '\n\n' +
      'ตัวอย่าง\n' +
      '• คิดว่า "คะแนนรีวิว" สำคัญกว่า "ระยะทาง" ชัดเจน → ข้อแรกเลือก คะแนนรีวิว · ข้อสองเลือก 5\n' +
      '• คิดว่าสองเรื่องสำคัญเท่ากัน → ข้อแรกเลือกอันไหนก็ได้ · ข้อสองเลือก 1\n\n' +
      'ไม่มีคำตอบถูกหรือผิด ตอบตามที่คุณให้ความสำคัญจริง\n' +
      'คำตอบควรไปในทางเดียวกัน เช่น ถ้าตอบว่า A สำคัญกว่า B และ B สำคัญกว่า C ก็ควรตอบว่า A สำคัญกว่า C'
    );

  // ส่วนที่ 3 เปรียบเทียบเป็นคู่ — n(n−1)/2 = 10 คู่ (Saaty 1987 น. 163)
  // 1 คู่ = 1 หน้า 2 ข้อ: "ไหนสำคัญกว่า" + "มากแค่ไหน" (รูปแบบคำถาม Saaty 1987 น. 164)
  // ชื่อข้อขึ้นต้นด้วย "k.1" / "k.2" ให้ตัวแปลงไฟล์ export หาคอลัมน์ได้ · ข้อ 2 = 1 แปลว่าเท่ากัน ไม่ว่าข้อ 1 เลือกอะไร
  let number = 1;
  for (let i = 0; i < FACTORS.length; i++) {
    for (let j = i + 1; j < FACTORS.length; j++) {
      const left = FACTORS[i];
      const right = FACTORS[j];
      form.addPageBreakItem().setTitle(`ส่วนที่ 3 · คู่ที่ ${number} จาก 10: ${left.name} เทียบกับ ${right.name}`);
      form.addMultipleChoiceItem()
        .setTitle(`${number}.1 เมื่อเลือกสถานที่ท่องเที่ยว ปัจจัยไหนสำคัญกว่า`)
        .setChoiceValues([left.name, right.name])
        .setRequired(true);
      form.addScaleItem()
        .setTitle(`${number}.2 สำคัญกว่ามากแค่ไหน`)
        .setHelpText(SCALE_TEXT)
        .setBounds(1, 9)
        .setLabels('สำคัญเท่ากัน', 'สำคัญกว่าอย่างยิ่ง')
        .setRequired(true);
      number++;
    }
  }

  form.setConfirmationMessage('ขอบคุณที่ตอบแบบสอบถาม');
  Logger.log('ลิงก์ฟอร์ม: ' + form.getPublishedUrl());
  Logger.log('ลิงก์แก้ไข: ' + form.getEditUrl());
}
