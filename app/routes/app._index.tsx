import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  List,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <Page title="GA4 Data Layer">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Stato
              </Text>
              <Banner tone="success">
                App attiva. Configura il GTM Container ID nel theme editor.
              </Banner>
              <Text as="p">
                Modifica il theme app embed block <strong>GA4 Data Layer</strong> in
                Online Store &rarr; Themes &rarr; Customize &rarr; App embeds.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Eventi tracciati
              </Text>
              <List type="bullet">
                <List.Item>view_item_list (PLP)</List.Item>
                <List.Item>select_item (click su PLP)</List.Item>
                <List.Item>view_item (PDP, re-fire on variant change)</List.Item>
                <List.Item>add_to_cart (intercept /cart/add.js)</List.Item>
                <List.Item>remove_from_cart (user-initiated only)</List.Item>
                <List.Item>view_cart</List.Item>
                <List.Item>begin_checkout (App Pixel)</List.Item>
                <List.Item>purchase (App Pixel, dedup nativo)</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Debug
              </Text>
              <Text as="p">
                Aggiungi <code>?ga4_debug=1</code> a qualsiasi URL storefront per
                attivare l'overlay di debug.
              </Text>
              <Text as="p">
                Snippet console disponibile in <code>docs/gtm-debug-snippet.js</code>.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
