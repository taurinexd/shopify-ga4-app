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
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

const PIXEL_QUERY = `#graphql
  query WebPixels { webPixel { id settings } }
`;

const PIXEL_CREATE_MUTATION = `#graphql
  mutation WebPixelCreate($webPixel: WebPixelInput!) {
    webPixelCreate(webPixel: $webPixel) {
      webPixel { id settings }
      userErrors { field message }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let pixelStatus: 'connected' | 'created' | 'error' = 'error';
  let pixelMessage = '';

  try {
    const existingResp = await admin.graphql(PIXEL_QUERY);
    const existingData = (await existingResp.json()) as {
      data?: { webPixel?: { id: string } | null };
    };
    if (existingData.data?.webPixel?.id) {
      pixelStatus = 'connected';
      pixelMessage = `pixel already registered (${existingData.data.webPixel.id})`;
    } else {
      const measurementId = process.env.GA4_MEASUREMENT_ID ?? '';
      const createResp = await admin.graphql(PIXEL_CREATE_MUTATION, {
        variables: { webPixel: { settings: JSON.stringify({ accountID: measurementId }) } },
      });
      const createData = (await createResp.json()) as {
        data?: {
          webPixelCreate?: {
            webPixel?: { id: string } | null;
            userErrors?: Array<{ field: string[]; message: string }>;
          };
        };
      };
      const errors = createData.data?.webPixelCreate?.userErrors ?? [];
      if (errors.length > 0) {
        pixelStatus = 'error';
        pixelMessage = errors.map((e) => `${e.field.join('.')}: ${e.message}`).join('; ');
      } else if (createData.data?.webPixelCreate?.webPixel?.id) {
        pixelStatus = 'created';
        pixelMessage = `pixel registered (${createData.data.webPixelCreate.webPixel.id})`;
      }
    }
  } catch (e) {
    pixelStatus = 'error';
    pixelMessage = e instanceof Error ? e.message : String(e);
  }

  return { pixelStatus, pixelMessage };
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const pixelTone =
    data.pixelStatus === 'error' ? 'critical' : data.pixelStatus === 'created' ? 'info' : 'success';
  const pixelTitle =
    data.pixelStatus === 'error'
      ? 'Web Pixel registration failed'
      : data.pixelStatus === 'created'
        ? 'Web Pixel registered'
        : 'Web Pixel connected';

  return (
    <Page title="GA4 Data Layer">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Stato
              </Text>
              <Banner tone={pixelTone} title={pixelTitle}>
                {data.pixelMessage}
              </Banner>
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
