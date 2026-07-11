import AppShell from "./app/App";
import { AppUpdateNotice } from "./features/settings/AppUpdateNotice";

export default function App() {
  return (
    <>
      <AppShell />
      <AppUpdateNotice />
    </>
  );
}
