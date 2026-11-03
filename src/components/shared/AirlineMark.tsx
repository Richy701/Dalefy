import { useState, type ReactNode } from "react";
import { AirplaneTilt } from "@phosphor-icons/react";
import { airlineLogoUrl } from "@/data/airlines";

/** The airline's logo on a white plate so it reads in both themes; a plane when we have no logo for it. */
export function AirlineMark({ flightNum, className = "h-6 w-6", fallback }: { flightNum?: string; className?: string; fallback?: ReactNode }) {
  const iata = flightNum?.trim().toUpperCase().match(/^([A-Z0-9]{2})/)?.[1] ?? "";
  const [failed, setFailed] = useState(false);
  if (fallback && (!iata || failed)) return fallback;
  return (
    <span className={`${className} shrink-0 rounded-full border border-border bg-white overflow-hidden flex items-center justify-center`}>
      {iata && !failed
        ? <img src={airlineLogoUrl(iata)} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-contain" />
        : <AirplaneTilt aria-hidden="true" className="h-3.5 w-3.5 text-neutral-700" weight="fill" />}
    </span>
  );
}
