/**
 * App Store Connect REST API response/request types.
 * JSON:API format (data/attributes/relationships).
 */

export interface AscResource<T = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: T;
  relationships?: Record<string, { data?: AscResourceRef | AscResourceRef[] }>;
}

export interface AscResourceRef {
  type: string;
  id: string;
}

export interface AscResponse<T = Record<string, unknown>> {
  data: AscResource<T>;
}

export interface AscListResponse<T = Record<string, unknown>> {
  data: AscResource<T>[];
}

export interface AppAttributes {
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}

export interface AppVersionAttributes {
  versionString: string;
  appStoreState: string;
  platform: string;
  createdDate: string;
}

export interface IapAttributes {
  productId: string;
  referenceName: string;
  inAppPurchaseType: string;
  state: string;
}

export interface SubscriptionGroupAttributes {
  referenceName: string;
}

export interface SubscriptionAttributes {
  productId: string;
  referenceName: string;
  subscriptionPeriod: string;
  state: string;
  familySharable: boolean;
}

export interface SubscriptionPriceAttributes {
  startDate: string | null;
}

export interface IapCreateBody {
  data: {
    type: 'inAppPurchases';
    attributes: {
      productId: string;
      referenceName: string;
      inAppPurchaseType: string;
      reviewNote?: string;
      familySharable?: boolean;
    };
    relationships: {
      app: { data: AscResourceRef };
    };
  };
}

export interface SubscriptionGroupCreateBody {
  data: {
    type: 'subscriptionGroups';
    attributes: { referenceName: string };
    relationships: {
      app: { data: AscResourceRef };
    };
  };
}

export interface SubscriptionCreateBody {
  data: {
    type: 'subscriptions';
    attributes: {
      productId: string;
      referenceName: string;
      subscriptionPeriod: string;
      reviewNote?: string;
      familySharable?: boolean;
    };
    relationships: {
      group: { data: AscResourceRef };
    };
  };
}

export interface SubscriptionPriceCreateBody {
  data: {
    type: 'subscriptionPrices';
    attributes: {
      startDate: string | null;
    };
    relationships: {
      territory: { data: AscResourceRef };
      subscriptionPricePoint: { data: AscResourceRef };
    };
  };
}
