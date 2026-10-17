import { recordNavigation } from "./lib/navHistory";
import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { AuctionPage } from "./pages/AuctionPage";
import { AuctionTermsPage } from "./pages/AuctionTermsPage";
import { BookingPage } from "./pages/BookingPage";
import { CarDetailPage } from "./pages/CarDetailPage";
import { ChatPage } from "./pages/ChatPage";
import { ContactPage } from "./pages/ContactPage";
import { FaqPage } from "./pages/FaqPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SellPage } from "./pages/SellPage";
import { ServicesPage } from "./pages/ServicesPage";
import { SoldPage } from "./pages/SoldPage";

const rootRoute = createRootRoute({
  component: Layout,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const servicesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/tjanster", component: ServicesPage });
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: "/om-oss", component: AboutPage });
const contactRoute = createRoute({ getParentRoute: () => rootRoute, path: "/kontakt", component: ContactPage });
const faqRoute = createRoute({ getParentRoute: () => rootRoute, path: "/faq", component: FaqPage });
const auctionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auktion", component: AuctionPage });
const sellRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auktion/salj", component: SellPage });
const soldRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auktion/salda", component: SoldPage });
const termsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auktion/villkor", component: AuctionTermsPage });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/integritet", component: PrivacyPage });
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/chatt/$token", component: ChatPage });
const carRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auktion/$id", component: CarDetailPage });

const bookingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boka",
  component: BookingPage,
  validateSearch: (search: Record<string, unknown>): { service?: string } =>
    typeof search.service === "string" ? { service: search.service } : {},
});

// Admin laddas separat (egen JS-fil) så att den publika sajten inte blir tyngre.
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: lazyRouteComponent(() => import("./admin/AdminLayout"), "AdminLayout"),
});
const adminPage = <P extends string>(path: P, name: keyof typeof import("./admin/pages")) =>
  createRoute({
    getParentRoute: () => adminRoute,
    path,
    component: lazyRouteComponent(() => import("./admin/pages"), name),
  });
const adminOverviewRoute = adminPage("/", "OverviewPage");
const adminCarsRoute = adminPage("/bilar", "CarsPage");
const adminCarNewRoute = adminPage("/bilar/ny", "CarEditorPage");
const adminCarEditRoute = adminPage("/bilar/$id", "CarEditorPage");
const adminBlocketRoute = adminPage("/bilar/$id/blocket", "BlocketWindowPage");
const adminBidsRoute = adminPage("/bud", "BidsPage");
const adminInboxRoute = adminPage("/inkorg", "InboxPage");
const adminInboxThreadRoute = adminPage("/inkorg/$id", "InboxPage");
const adminBookingsRoute = adminPage("/bokningar", "BookingsPage");
const adminContentRoute = adminPage("/innehall", "ContentPage");
const adminSettingsRoute = adminPage("/installningar", "SettingsPage");

const routeTree = rootRoute.addChildren([
  homeRoute,
  servicesRoute,
  bookingRoute,
  aboutRoute,
  contactRoute,
  faqRoute,
  auctionRoute,
  sellRoute,
  soldRoute,
  termsRoute,
  privacyRoute,
  chatRoute,
  carRoute,
  adminRoute.addChildren([
    adminOverviewRoute,
    adminCarsRoute,
    adminCarNewRoute,
    adminCarEditRoute,
    adminBlocketRoute,
    adminBidsRoute,
    adminInboxRoute,
    adminInboxThreadRoute,
    adminBookingsRoute,
    adminContentRoute,
    adminSettingsRoute,
  ]),
]);

// scrollRestoration: går man tillbaka (bakåtknappen) hamnar man där man var på sidan;
// en ny länk börjar högst upp.
export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });
router.subscribe("onResolved", ({ toLocation }) => recordNavigation(toLocation.pathname));

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
