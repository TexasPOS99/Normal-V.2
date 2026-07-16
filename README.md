# All-in-One Tools — Firebase Edition

เวอร์ชันนี้ย้ายฐานข้อมูลจาก Supabase ไป Cloud Firestore และเพิ่ม Google Sign-in เพื่อป้องกันข้อมูลส่วนตัว

## ตั้งค่าครั้งแรก

1. เข้า https://console.firebase.google.com แล้วสร้างโปรเจกต์ใหม่
2. ไปที่ **Build > Firestore Database > Create database**
3. ไปที่ **Build > Authentication > Sign-in method** แล้วเปิด **Google**
4. ไปที่ **Project settings > Your apps > Web app** แล้วคัดลอกค่า config มาใส่ใน `firebase-config.js`
5. ใน **Firestore Database > Rules** นำเนื้อหา `firestore.rules` ไปวางแล้วกด Publish
6. อัปโหลดไฟล์ทั้งหมดขึ้น Vercel เหมือนเว็บเดิม

> แนะนำให้ดาวน์โหลดสำเนาข้อมูลเป็นระยะ เพราะบริการฟรีทุกแห่งสามารถเปลี่ยนโควตาหรือนโยบายในอนาคตได้

## ข้อมูลเก่า

ข้อมูลเดิมไม่อยู่ในไฟล์เว็บไซต์ ถ้ายังกู้ Supabase ได้ ให้ Restore แล้ว Export ตาราง `links` ก่อน
