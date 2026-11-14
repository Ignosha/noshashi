import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { sentenceCase } from "@/lib/format";

const buttonVariants = cva(
  "desk-button rounded-sm inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-85",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-85",
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:opacity-85",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

/**
 * Console-era call sites wrote their labels in capitals ("READ HISTORY").
 * The Ledger Desk sets every button as a sentence, so plain-text labels are
 * re-cased here once instead of at two hundred call sites. Acronyms stay.
 */
function caseLabel(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return sentenceCase(children);
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === "string" ? sentenceCase(child) : child));
  }
  return children;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {asChild ? children : caseLabel(children)}
    </Comp>
  );
}

export { Button, buttonVariants };
