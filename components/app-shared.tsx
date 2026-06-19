import type { ReactNode } from "react";
import {
	LayoutGridIcon,
	PackageIcon,
	ShoppingBagIcon,
	StarIcon,
	TagIcon,
	UsersIcon,
	MessageSquareIcon,
	LayersIcon,
	SettingsIcon,
	StoreIcon,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		label: "Store",
		items: [
			{
				title: "Overview",
				path: "/admin",
				icon: <LayoutGridIcon />,
			},
			{
				title: "Inventory",
				path: "/admin/inventory",
				icon: <PackageIcon />,
			},
			{
				title: "Orders",
				path: "/admin/orders",
				icon: <ShoppingBagIcon />,
			},
			{
				title: "Reviews",
				path: "/admin/reviews",
				icon: <StarIcon />,
			},
		],
	},
	{
		label: "Customers",
		items: [
			{
				title: "Customers",
				path: "/admin/patrons",
				icon: <UsersIcon />,
			},
			{
				title: "Negotiations",
				path: "/admin/negotiations",
				icon: <MessageSquareIcon />,
			},
			{
				title: "Discounts",
				path: "/admin/concessions",
				icon: <TagIcon />,
			},
		],
	},
	{
		label: "System",
		items: [
			{
				title: "Sandbox",
				path: "/admin/sandbox",
				icon: <LayersIcon />,
			},
			{
				title: "Settings",
				path: "/admin/settings",
				icon: <SettingsIcon />,
			},
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "View Storefront",
		path: "/",
		icon: <StoreIcon />,
	},
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
