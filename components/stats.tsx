import {
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { DashboardCard } from "@/components/dashboard-card";

export type Stat = {
	label: string;
	value: string;
	delta: number;
};

const defaultStats: Stat[] = [
	{ label: "Revenue", value: "—", delta: 0 },
	{ label: "Orders", value: "—", delta: 0 },
	{ label: "Products", value: "—", delta: 0 },
	{ label: "Reviews", value: "—", delta: 0 },
];

export function DashboardStats({
	items,
	loading,
}: {
	items?: Stat[];
	loading?: boolean;
}) {
	const displayStats = items ?? defaultStats;

	return (
		<>
			{displayStats.map((s) => (
				<DashboardCard className="" key={s.label}>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="font-normal text-xs tracking-wide">
							{s.label}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-row items-center gap-2">
						{loading ? (
							<div className="h-8 w-24 animate-pulse rounded bg-muted" />
						) : (
							<p className="font-semibold text-2xl tabular-nums">{s.value}</p>
						)}
					</CardContent>
					<CardFooter className="gap-1 rounded-none bg-background text-xs">
						{s.delta !== 0 ? (
							<>
								<Delta value={s.delta}>
									<DeltaIcon />
									<DeltaValue />
								</Delta>
								<span className="text-muted-foreground">vs last week</span>
							</>
						) : (
							<span className="text-muted-foreground">Live data</span>
						)}
					</CardFooter>
				</DashboardCard>
			))}
		</>
	);
}
