import { ContextProvider } from "./Wagmi";
import { Showcase } from "./Showcase";

export const App: React.FC = () => {
  return (
    <ContextProvider>
      <Showcase />
    </ContextProvider>
  );
};
