type ActivityDay = {
  date: string;
  count: number;
};

type ActivityHeatmapProps = {
  days: ActivityDay[];
};

function getHeatLevel(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return "bg-zinc-100";

  const ratio = count / maxCount;
  if (ratio >= 0.75) return "bg-blue-700";
  if (ratio >= 0.5) return "bg-blue-500";
  if (ratio >= 0.25) return "bg-blue-300";
  return "bg-blue-100";
}

export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  const maxCount = Math.max(...days.map((day) => day.count), 0);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            近 30 天知识生产热力图
          </h2>

        </div>
        <div className="text-right text-sm text-zinc-500">
          峰值 {maxCount.toLocaleString("zh-CN")} 次
        </div>
      </div>

      <div className="grid grid-cols-10 gap-2">
        {days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}: ${day.count} 个文档`}
            className={`flex h-10 items-center justify-center rounded-lg text-xs font-medium text-zinc-700 ${getHeatLevel(
              day.count,
              maxCount
            )}`}
          >
            {day.count > 0 ? day.count : ""}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </section>
  );
}
