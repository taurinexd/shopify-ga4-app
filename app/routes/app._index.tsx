import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  List,
  Banner,
  Button,
  InlineStack,
} from "@shopify/polaris";
import { useLoaderData, Form } from "@remix-run/react";
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

const PIXEL_DELETE_MUTATION = `#graphql
  mutation WebPixelDelete($id: ID!) {
    webPixelDelete(id: $id) {
      deletedWebPixelId
      userErrors { field message }
    }
  }
`;

async function findExistingPixelId(admin: { graphql: (q: string) => Promise<Response> }) {
  try {
    const resp = await admin.graphql(PIXEL_QUERY);
    const data = (await resp.json()) as { data?: { webPixel?: { id: string } | null } };
    return data.data?.webPixel?.id ?? null;
  } catch {
    return null;
  }
}

async function createPixel(
  admin: { graphql: (q: string, opts?: { variables: unknown }) => Promise<Response> },
  measurementId: string,
) {
  const resp = await admin.graphql(PIXEL_CREATE_MUTATION, {
    variables: { webPixel: { settings: { accountID: measurementId } } },
  });
  const data = (await resp.json()) as {
    data?: {
      webPixelCreate?: {
        webPixel?: { id: string } | null;
        userErrors?: Array<{ field?: string[]; message: string; code?: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };
  const errors = data.data?.webPixelCreate?.userErrors ?? [];
  if (errors.length > 0) {
    return {
      ok: false as const,
      message: errors.map((e) => `${e.field?.join('.') ?? 'webPixel'}: ${e.message}`).join('; '),
    };
  }
  if (data.data?.webPixelCreate?.webPixel?.id) {
    return { ok: true as const, id: data.data.webPixelCreate.webPixel.id };
  }
  if (data.errors?.length) {
    return { ok: false as const, message: data.errors.map((e) => e.message).join('; ') };
  }
  return { ok: false as const, message: 'webPixelCreate returned no data' };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get('intent');

  if (intent === 'reinstall-pixel') {
    const existingId = await findExistingPixelId(admin);
    if (existingId) {
      await admin.graphql(PIXEL_DELETE_MUTATION, { variables: { id: existingId } });
    }
    const measurementId = process.env.GA4_MEASUREMENT_ID ?? '';
    if (measurementId) await createPixel(admin, measurementId);
  }

  return redirect('/app');
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let pixelStatus: 'connected' | 'created' | 'error' = 'error';
  let pixelMessage = '';

  const existingId = await findExistingPixelId(admin);

  if (existingId) {
    pixelStatus = 'connected';
    pixelMessage = `Pixel already registered (${existingId})`;
    return { pixelStatus, pixelMessage };
  }

  const measurementId = process.env.GA4_MEASUREMENT_ID ?? '';
  if (!measurementId) {
    return {
      pixelStatus: 'error' as const,
      pixelMessage: 'GA4_MEASUREMENT_ID env var is not set',
    };
  }

  const result = await createPixel(admin, measurementId);
  if (result.ok) {
    pixelStatus = 'created';
    pixelMessage = `Pixel registered (${result.id})`;
  } else {
    pixelStatus = 'error';
    pixelMessage = result.message;
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
              <Form method="post">
                <input type="hidden" name="intent" value="reinstall-pixel" />
                <InlineStack gap="200">
                  <Button submit variant="secondary">
                    Reinstall pixel (force fresh bundle)
                  </Button>
                </InlineStack>
              </Form>
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
