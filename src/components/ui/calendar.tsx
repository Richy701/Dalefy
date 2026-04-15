import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-6",
        month: "space-y-3",
        caption: "flex justify-center relative items-center h-10",
        caption_label: "text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white",
        nav: "flex items-center",
        nav_button: "h-8 w-8 rounded-lg bg-slate-100 dark:bg-[#2a2a2a] hover:bg-slate-200 dark:hover:bg-[#3a3a3a] text-slate-600 dark:text-[#ccc] hover:text-slate-900 dark:hover:text-white transition-colors inline-flex items-center justify-center border border-slate-200 dark:border-[#3a3a3a] cursor-pointer",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "text-slate-500 dark:text-[#888] rounded-md w-10 font-bold text-xs uppercase tracking-wider",
        row: "flex w-full mt-1",
        cell: "h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-lg [&:has([aria-selected].day-outside)]:bg-[#0bd2b5]/15 [&:has([aria-selected])]:bg-[#0bd2b5]/15 first:[&:has([aria-selected])]:rounded-l-lg last:[&:has([aria-selected])]:rounded-r-lg focus-within:relative focus-within:z-20",
        day: "h-10 w-10 p-0 font-medium rounded-lg text-slate-700 dark:text-[#d0d0d0] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] hover:text-slate-900 dark:hover:text-white transition-colors inline-flex items-center justify-center aria-selected:opacity-100 cursor-pointer",
        day_range_end: "day-range-end",
        day_selected: "bg-[#0bd2b5] text-black hover:bg-[#0bd2b5] hover:text-black focus:bg-[#0bd2b5] focus:text-black font-bold rounded-lg",
        day_today: "font-bold text-[#0bd2b5] dark:text-[#0bd2b5] underline underline-offset-2 decoration-[#0bd2b5]/40",
        day_outside: "day-outside text-slate-300 dark:text-[#888] aria-selected:bg-[#0bd2b5]/5 aria-selected:text-slate-500 dark:aria-selected:text-[#666]",
        day_disabled: "text-slate-300 dark:text-[#888888] cursor-not-allowed",
        day_range_middle: "aria-selected:bg-[#0bd2b5]/15 aria-selected:text-slate-900 dark:aria-selected:text-white rounded-none",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
