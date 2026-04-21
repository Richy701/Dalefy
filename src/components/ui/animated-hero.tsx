import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";

function AnimatedHero({
  titles = ["amazing", "new", "wonderful", "beautiful", "smart"],
  staticText = "This is something",
  children,
}: {
  titles?: string[];
  staticText?: string;
  children?: React.ReactNode;
}) {
  const [titleNumber, setTitleNumber] = useState(0);
  const memoTitles = useMemo(() => titles, [titles]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (titleNumber === memoTitles.length - 1) {
        setTitleNumber(0);
      } else {
        setTitleNumber(titleNumber + 1);
      }
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [titleNumber, memoTitles]);

  return (
    <div className="w-full">
      <div className="container mx-auto">
        <div className="flex gap-8 py-20 lg:py-40 items-center justify-center flex-col">
          <div className="flex gap-4 flex-col">
            <h1 className="text-5xl md:text-7xl max-w-2xl tracking-tighter text-center font-regular">
              <span>{staticText}</span>
              <span className="relative flex w-full justify-center overflow-hidden text-center md:pb-4 md:pt-1">
                &nbsp;
                {memoTitles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-semibold"
                    initial={{ opacity: 0, y: "-100" }}
                    transition={{ type: "spring", stiffness: 50 }}
                    animate={
                      titleNumber === index
                        ? {
                            y: 0,
                            opacity: 1,
                          }
                        : {
                            y: titleNumber > index ? -150 : 150,
                            opacity: 0,
                          }
                    }
                  >
                    {title}
                  </motion.span>
                ))}
              </span>
            </h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export { AnimatedHero };
