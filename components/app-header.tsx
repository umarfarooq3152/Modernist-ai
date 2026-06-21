import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { DecorIcon } from "@/components/decor-icon";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { navLinks } from "@/components/app-shared";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import { useLocation, Link } from "react-router-dom";
import { ShoppingBagIcon } from "lucide-react";

export function AppHeader() {
	const { pathname } = useLocation();

	const activeItem = navLinks.find((item) => {
		if (!item.path) return false;
		if (item.path === "/admin") return pathname === "/admin";
		return pathname.startsWith(item.path);
	});

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
			)}
		>
			<DecorIcon className="hidden md:block" position="bottom-left" />
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} />
			</div>
			<div className="flex items-center gap-3">
				<Link
					to="/?preview=customer"
					className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<ShoppingBagIcon size={13} />
					<span className="hidden sm:inline">View as Customer</span>
				</Link>
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser />
			</div>
		</header>
	);
}
