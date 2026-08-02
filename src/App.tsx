import AppShell from "./app/App";
import { AppUpdateNotice } from "./features/settings/AppUpdateNotice";
import { AppUpdateProvider } from "./features/settings/AppUpdateProvider";

export default function App() {
  return (
    <AppUpdateProvider>
      <AppShell />
      <AppUpdateNotice />
    </AppUpdateProvider>
  );
}
