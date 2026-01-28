import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState, Suspense, useMemo } from 'react';
import { lazyWithFallback, SectionNotFound } from '../components/common/404';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  const tabs = ['Übersicht', 'Rechnungsgenerator'];

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const activeTab = tabs[activeTabIndex];

  const ActiveComponent = useMemo(() => {
    const Fallback = () => <SectionNotFound tab={activeTab} />;

    return lazyWithFallback(
      () => import(`../components/_index/section-${activeTabIndex}.tsx`),
      Fallback
    );
  }, [activeTab, activeTabIndex]);

  return (
    <s-page heading="PUMPSHOT">
      <s-stack gap="base">
        <s-stack direction="inline" gap="base">
          {tabs.map((tab, index) => (
            <s-button
              key={tab}
              variant={tab === activeTab ? 'secondary' : 'tertiary'}
              onClick={() => setActiveTabIndex(index)}
            >
              {tab}
            </s-button>
          ))}
        </s-stack>
        <s-section heading={activeTab}>
          <Suspense fallback={<p>Loading {activeTab}...</p>}>
            <ActiveComponent />
          </Suspense>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
