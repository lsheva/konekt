import { ContextProvider } from "./Wagmi";
import { Connect } from "./Connect";

export const App: React.FC = () => {
  return (
    <ContextProvider>
      <Connect />
    </ContextProvider>
  );
};
