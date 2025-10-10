// @cursor:start(centralized-client)
import { getShopifyClient } from '../lib/shopify/shopifyClient.js';

export async function shopifyGraphql({ shopDomain, accessToken, query, variables }) {
  const client = await getShopifyClient(shopDomain);
  return await client.graphql(query, variables);
}
// @cursor:end(centralized-client)

// Helper to fetch existing discounts
export async function fetchExistingDiscounts({ shopDomain, accessToken, query = '' }) {
  const graphqlQuery = `
    query fetchDiscounts($query: String) {
      codeDiscountNodes(first: 50, query: $query) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                code
                status
                startsAt
                endsAt
                usageLimit
                appliesOncePerCustomer
                minimumRequirement {
                  ... on DiscountMinimumQuantity {
                    greaterThanOrEqualToQuantity
                  }
                  ... on DiscountMinimumSubtotal {
                    greaterThanOrEqualToSubtotal {
                      amount
                      currencyCode
                    }
                  }
                }
                customerSelection {
                  ... on DiscountCustomerAll {
                    allCustomers
                  }
                  ... on DiscountCustomerSegments {
                    segments {
                      id
                      name
                    }
                  }
                }
                combinesWith {
                  orderDiscounts
                  productDiscounts
                  shippingDiscounts
                }
              }
            }
          }
        }
      }
    }
  `;

  return await shopifyGraphql({
    shopDomain,
    accessToken,
    query: graphqlQuery,
    variables: { query }
  });
}

// Helper to create a basic discount code
export async function createBasicCode({ shopDomain, accessToken, input }) {
  const graphqlQuery = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              code
              status
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  return await shopifyGraphql({
    shopDomain,
    accessToken,
    query: graphqlQuery,
    variables: { basicCodeDiscount: input }
  });
}

// Helper to fetch abandoned checkout URL
export async function fetchAbandonedCheckoutUrl({ shopDomain, accessToken, checkoutToken }) {
  const graphqlQuery = `
    query getAbandonedCheckout($token: String!) {
      abandonedCheckout(token: $token) {
        id
        abandonedCheckoutUrl
        email
        phone
        totalPrice {
          amount
          currencyCode
        }
        customer {
          id
          email
          phone
        }
        lineItems(first: 10) {
          edges {
            node {
              id
              title
              quantity
              variant {
                id
                title
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  `;

  return await shopifyGraphql({
    shopDomain,
    accessToken,
    query: graphqlQuery,
    variables: { token: checkoutToken }
  });
}

// Helper to get shop information
export async function getShopInfo({ shopDomain, accessToken }) {
  const graphqlQuery = `
    query getShop {
      shop {
        id
        name
        myshopifyDomain
        email
        currencyCode
        timezoneAbbreviation
        timezoneOffsetMinutes
        ianaTimezone
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
      }
    }
  `;

  return await shopifyGraphql({
    shopDomain,
    accessToken,
    query: graphqlQuery
  });
}

// Helper to get customer information
export async function getCustomer({ shopDomain, accessToken, customerId }) {
  const graphqlQuery = `
    query getCustomer($id: ID!) {
      customer(id: $id) {
        id
        email
        phone
        firstName
        lastName
        tags
        acceptsMarketing
        createdAt
        updatedAt
        defaultAddress {
          id
          firstName
          lastName
          company
          address1
          address2
          city
          province
          country
          zip
          phone
        }
        addresses(first: 10) {
          edges {
            node {
              id
              firstName
              lastName
              company
              address1
              address2
              city
              province
              country
              zip
              phone
            }
          }
        }
      }
    }
  `;

  return await shopifyGraphql({
    shopDomain,
    accessToken,
    query: graphqlQuery,
    variables: { id: customerId }
  });
}
