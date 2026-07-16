# All-in-One Tools — Firebase Edition

เวอร์ชันนี้ย้ายฐานข้อมูลจาก Supabase ไป Cloud Firestore และเปิดใช้งานได้ทันทีโดยไม่ต้องล็อกอิน

## ตั้งค่าครั้งแรก

1. เข้า https://console.firebase.google.com แล้วสร้างโปรเจกต์ใหม่
2. ไปที่ **Build > Firestore Database > Create database**
3. ไปที่ **Project settings > Your apps > Web app** แล้วคัดลอกค่า config มาใส่ใน `firebase-config.js`
4. ใน **Firestore Database > Rules** นำเนื้อหา `firestore.rules` ไปวางแล้วกด Publish
5. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub Pages หรือ Vercel

> คำเตือน: Rules ชุดนี้เปิดฐานข้อมูลเป็นสาธารณะ ทุกคนที่เข้าถึงโปรเจกต์ได้สามารถอ่าน แก้ไข และลบข้อมูลได้

> แนะนำให้ดาวน์โหลดสำเนาข้อมูลเป็นระยะ เพราะบริการฟรีทุกแห่งสามารถเปลี่ยนโควตาหรือนโยบายในอนาคตได้

## ข้อมูลเก่า

ข้อมูลเดิมไม่อยู่ในไฟล์เว็บไซต์ ถ้ายังกู้ Supabase ได้ ให้ Restore แล้ว Export ตาราง `links` ก่อน
