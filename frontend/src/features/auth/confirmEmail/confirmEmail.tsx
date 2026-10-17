import "./confirmEmail.css";

export default function ConfirmEmail() {

  return (
    <div className="font-sarabun relative min-h-screen flex items-center justify-center overflow-hidden bg-[#fae3d9]">

      {/* Background blobs */}
      <div className="blob-1 absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#ffb6b9] opacity-50 blur-[70px] pointer-events-none" />
      <div className="blob-2 absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-[#61c0bf] opacity-40 blur-[70px] pointer-events-none" />
      <div className="blob-3 absolute top-16 right-24 w-52 h-52 rounded-full bg-[#bbded6] opacity-40 blur-[60px] pointer-events-none" />

      {/* Card */}
      <div className="animate-slide-up-1 relative z-10 w-[90%] max-w-md px-12 py-14 rounded-[36px] border border-white/80 shadow-2xl bg-white/70 backdrop-blur-2xl text-center">

        {/* Icon */}
        <div className="animate-slide-up-2 text-6xl mb-6">📬</div>

        {/* Title */}
        <h2 className="animate-slide-up-3 font-prompt font-extrabold text-3xl text-[#6b3a2a] mb-4">
          ตรวจสอบอีเมลของคุณ
        </h2>

        {/* Description */}
        <p className="animate-slide-up-4 text-[#9c6b55] text-base leading-relaxed mb-8">
          ระบบได้ส่งอีเมลยืนยันไปยังบัญชีของคุณแล้ว
          <br />
          กรุณากดลิงก์ในอีเมลเพื่อเข้าสู่ระบบ
        </p>
        {/* Dots */}
        <div className="animate-slide-up-6 flex justify-center gap-2 mt-8">
          <div className="w-2 h-2 rounded-full bg-[#ffb6b9]" />
          <div className="w-2 h-2 rounded-full bg-[#fae3d9]" />
          <div className="w-2 h-2 rounded-full bg-[#bbded6]" />
          <div className="w-2 h-2 rounded-full bg-[#61c0bf]" />
        </div>
      </div>
    </div>
  );
}