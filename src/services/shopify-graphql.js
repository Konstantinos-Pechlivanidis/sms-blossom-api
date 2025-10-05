const API_VERSION = '2025-10';

export async function shopifyGraphql({ shopDomain, accessToken, query, variables }) {
  const url = `https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const error = new Error('Shopify GraphQL error');
    error.details = json.errors || json;
    throw error;
  }
  const data = json.data;
  // Bubble userErrors if present inside known envelopes
  const envelopes = Object.values(data || {});
  for (const env of envelopes) {
    if (env && Array.isArray(env.userErrors) && env.userErrors.length > 0) {
      const error = new Error('Shopify GraphQL userErrors');
      error.details = env.userErrors;
      throw error;
    }
  }
  return data;
}
