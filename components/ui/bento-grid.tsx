import { cn } from "@/lib/utils";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        // 宽度交给调用方（首页 .wh-bento 要铺满 .wh-shell 的 1440 内容宽）：
        // 此前这里写死 max-w-7xl(1280)，四区块比同页 hero 窄 64–160px。
        "mx-auto grid grid-cols-1 gap-4 md:auto-rows-[18rem] md:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  title,
  description,
  header,
  icon,
}: {
  className?: string;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  header?: React.ReactNode;
  icon?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        // 颜色一律走语义 token（bg-semantic-* 自带亮/暗两套值，无需 dark: 变体），
        // 不再写裸调色板 bg-white / bg-black / neutral-*。
        "group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-semantic-line bg-semantic-surface p-4 transition duration-200 hover:shadow-xl dark:shadow-none",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-2">
        {icon}
        <div className="mt-2 mb-2 font-sans font-bold text-semantic-heading">
          {title}
        </div>
        <div className="font-sans text-xs font-normal text-semantic-muted">
          {description}
        </div>
      </div>
    </div>
  );
};
