import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type { ComplianceDoc, User } from "@/types";

/** The traveller directory and HR compliance; provided by DirectoryProvider (DirectoryContext.tsx) */
export type Compliance = Record<string, ComplianceDoc[]>;

export interface DirectoryValue {
  travelers: User[];
  setTravelers: Dispatch<SetStateAction<User[]>>;
  compliance: Compliance;
  setCompliance: Dispatch<SetStateAction<Compliance>>;
}

export const DirectoryContext = createContext<DirectoryValue | null>(null);

function useDirectory(): DirectoryValue {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used inside DirectoryProvider");
  return ctx;
}

/** The organisation's traveller directory, as [list, setter] like useState */
export function useDirectoryTravelers(): [User[], Dispatch<SetStateAction<User[]>>] {
  const { travelers, setTravelers } = useDirectory();
  return [travelers, setTravelers];
}

/** HR compliance records by traveller ID, as [map, setter] like useState */
export function useComplianceRecords(): [Compliance, Dispatch<SetStateAction<Compliance>>] {
  const { compliance, setCompliance } = useDirectory();
  return [compliance, setCompliance];
}
