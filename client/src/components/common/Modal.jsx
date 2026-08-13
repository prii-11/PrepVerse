// Generic modal wrapper for dialogs and overlays.
import Button from './Button';

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2937]/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-[0_24px_80px_rgba(85,107,47,0.12)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#1F2937]">{title}</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <div className="text-sm text-[#6B7280]">{children}</div>
      </div>
    </div>
  );
}
