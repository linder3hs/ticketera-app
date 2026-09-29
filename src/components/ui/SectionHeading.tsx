import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  description: string;
  className?: string;
}

export function SectionHeading({ title, description, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-col gap-1 lg:gap-2", className)}>
      <h2 className="text-2xl leading-tight font-bold tracking-tight lg:text-[32px]">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground lg:text-base">{description}</p>
    </div>
  );
}
