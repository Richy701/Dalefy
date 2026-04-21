import { cn } from "@/lib/utils";

interface LaptopMockupProps {
  children: React.ReactNode;
  className?: string;
}

export function LaptopMockup({ children, className }: LaptopMockupProps) {
  return (
    <div className={cn("w-full", className)}>
      {/* Screen */}
      <div className="relative mx-auto w-[90%]">
        {/* Bezel */}
        <div className="rounded-t-xl bg-[#1a1a1a] border border-b-0 border-[#333] pt-3 pb-0 px-3">
          {/* Notch */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#111] border border-[#2a2a2a]" />
          {/* Screen content */}
          <div className="rounded-t-sm overflow-hidden">
            {children}
          </div>
        </div>
      </div>
      {/* Hinge */}
      <div className="relative mx-auto w-[95%] h-[10px] bg-gradient-to-b from-[#2a2a2a] to-[#1f1f1f] rounded-b-sm" />
      {/* Base */}
      <div className="mx-auto w-full h-[6px] bg-[#1a1a1a] rounded-b-lg border border-t-0 border-[#333]" />
    </div>
  );
}
