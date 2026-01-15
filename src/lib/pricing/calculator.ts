/**
 * Pricing Calculator
 *
 * Calculates material costs using multi-supplier pricing and generates estimates.
 */

import { prisma } from "@/lib/prisma";
import type { LineItem, ProductCatalog } from "@prisma/client";

export interface PricedItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  rcv: number | null;
  // Pricing info
  matched: boolean;
  productId?: string;
  productName?: string;
  unitPrice?: number;
  totalPrice?: number;
  supplier?: string;
  sku?: string;
}

export interface EstimateResult {
  items: PricedItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  profit: number;
  primarySupplier: string;
  supplierBreakdown: Record<string, { count: number; total: number }>;
}

interface EstimateOptions {
  preferredSupplier?: string;
  laborMarkup?: number;
  materialMarkup?: number;
  overhead?: number;
}

// Material categories that need product matching
const MATERIAL_CATEGORIES = [
  "shingles",
  "underlayment",
  "pipe_jack",
  "vent",
  "drip_edge",
  "starter",
  "hip_ridge",
  "ice_water",
  "flashing",
  "nails",
  "sealant",
];

// Labor line item indicators
const LABOR_INDICATORS = [
  "labor",
  "install",
  "remove",
  "tear",
  "r&r",
  "replace",
  "repair",
  "detach",
  "reset",
];

export class PricingCalculator {
  /**
   * Calculate estimate for line items
   */
  async calculateEstimate(
    lineItems: LineItem[],
    organizationId: string,
    options: EstimateOptions = {}
  ): Promise<EstimateResult> {
    const {
      preferredSupplier = "lowest",
      laborMarkup = 0.35,
      materialMarkup = 0.25,
    } = options;

    // Separate material and labor items
    const materialItems: LineItem[] = [];
    const laborItems: LineItem[] = [];

    for (const item of lineItems) {
      if (this.isLaborItem(item)) {
        laborItems.push(item);
      } else {
        materialItems.push(item);
      }
    }

    // Price material items
    const pricedMaterials = await this.priceMaterials(
      materialItems,
      organizationId,
      preferredSupplier
    );

    // Calculate labor cost (use RCV as base if available)
    let totalLaborCost = 0;
    for (const item of laborItems) {
      const rcv = Number(item.rcv) || 0;
      totalLaborCost += rcv * (1 - laborMarkup); // Apply reverse markup to get cost
    }

    // Calculate totals
    const totalMaterialCost = pricedMaterials.items.reduce(
      (sum, item) => sum + (item.totalPrice || 0),
      0
    );

    // Calculate supplier breakdown
    const supplierBreakdown: Record<string, { count: number; total: number }> = {};
    for (const item of pricedMaterials.items) {
      if (item.supplier) {
        if (!supplierBreakdown[item.supplier]) {
          supplierBreakdown[item.supplier] = { count: 0, total: 0 };
        }
        supplierBreakdown[item.supplier].count++;
        supplierBreakdown[item.supplier].total += item.totalPrice || 0;
      }
    }

    // Find primary supplier
    const primarySupplier =
      Object.entries(supplierBreakdown).sort((a, b) => b[1].total - a[1].total)[0]?.[0] ||
      "none";

    // Calculate profit (RCV - Cost)
    const totalRCV = lineItems.reduce((sum, item) => sum + (Number(item.rcv) || 0), 0);
    const totalCost = totalMaterialCost + totalLaborCost;
    const profit = totalRCV - totalCost;

    // Add labor items to priced items
    const allPricedItems: PricedItem[] = [
      ...pricedMaterials.items,
      ...laborItems.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        rcv: Number(item.rcv),
        matched: true,
        unitPrice: Number(item.rcv) * (1 - laborMarkup),
        totalPrice: Number(item.rcv) * (1 - laborMarkup),
        supplier: "labor",
      })),
    ];

    return {
      items: allPricedItems,
      totalMaterialCost,
      totalLaborCost,
      profit,
      primarySupplier,
      supplierBreakdown,
    };
  }

  /**
   * Price material items using product catalog
   */
  private async priceMaterials(
    items: LineItem[],
    organizationId: string,
    preferredSupplier: string
  ): Promise<{ items: PricedItem[] }> {
    const pricedItems: PricedItem[] = [];

    // Get all products for matching
    const products = await prisma.productCatalog.findMany({
      where: { isActive: true },
    });

    // Get supplier configurations
    const supplierConfigs = await prisma.supplierConfiguration.findMany({
      where: {
        organizationId,
        isEnabled: true,
      },
    });

    const enabledSuppliers = new Set(supplierConfigs.map((c) => c.supplier));

    for (const item of items) {
      // Try to match to a product
      const match = this.findBestProductMatch(item, products);

      if (match) {
        // Get best price
        const pricing = this.getBestPrice(match, preferredSupplier, enabledSuppliers);

        pricedItems.push({
          id: item.id,
          category: item.category,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          rcv: Number(item.rcv),
          matched: true,
          productId: match.id,
          productName: match.name,
          unitPrice: pricing?.unitPrice,
          totalPrice: pricing ? pricing.unitPrice * Number(item.quantity) : undefined,
          supplier: pricing?.supplier,
          sku: pricing?.sku,
        });
      } else {
        // No match - use RCV as fallback
        pricedItems.push({
          id: item.id,
          category: item.category,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          rcv: Number(item.rcv),
          matched: false,
          // Estimate cost at 60% of RCV if no match
          totalPrice: (Number(item.rcv) || 0) * 0.6,
        });
      }
    }

    return { items: pricedItems };
  }

  /**
   * Find best matching product for a line item
   */
  private findBestProductMatch(
    item: LineItem,
    products: ProductCatalog[]
  ): ProductCatalog | null {
    const description = item.description.toLowerCase();
    const subcategory = item.subcategory?.toLowerCase();

    let bestMatch: ProductCatalog | null = null;
    let bestScore = 0;

    for (const product of products) {
      let score = 0;

      // Category match
      if (product.category.toLowerCase() === item.category.toLowerCase()) {
        score += 2;
      }

      // Subcategory match
      if (subcategory && product.subcategory?.toLowerCase() === subcategory) {
        score += 3;
      }

      // Name contains description words
      const productName = product.name.toLowerCase();
      const descWords = description.split(/\s+/);
      for (const word of descWords) {
        if (word.length > 2 && productName.includes(word)) {
          score += 1;
        }
      }

      // SKU or manufacturer match
      if (product.manufacturerSku && description.includes(product.manufacturerSku.toLowerCase())) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    // Require minimum score for a match
    return bestScore >= 3 ? bestMatch : null;
  }

  /**
   * Get best price from available suppliers
   */
  private getBestPrice(
    product: ProductCatalog,
    preference: string,
    enabledSuppliers: Set<string>
  ): { unitPrice: number; supplier: string; sku?: string } | null {
    const suppliers = [
      {
        name: "beacon",
        price: product.beaconPrice ? Number(product.beaconPrice) : null,
        sku: product.beaconSku,
      },
      {
        name: "srs",
        price: product.srsPrice ? Number(product.srsPrice) : null,
        sku: product.srsSku,
      },
      {
        name: "abc",
        price: product.abcPrice ? Number(product.abcPrice) : null,
        sku: product.abcSku,
      },
      {
        name: "gulf_eagle",
        price: product.gulfEaglePrice ? Number(product.gulfEaglePrice) : null,
        sku: product.gulfEagleSku,
      },
    ].filter((s) => s.price !== null && enabledSuppliers.has(s.name));

    if (suppliers.length === 0) {
      return null;
    }

    // If preferred supplier specified and available, use it
    if (preference && preference !== "lowest") {
      const preferred = suppliers.find((s) => s.name === preference);
      if (preferred && preferred.price !== null) {
        return {
          unitPrice: preferred.price,
          supplier: preferred.name,
          sku: preferred.sku || undefined,
        };
      }
    }

    // Otherwise, return lowest price
    suppliers.sort((a, b) => (a.price || 999999) - (b.price || 999999));
    const lowest = suppliers[0];

    if (lowest && lowest.price !== null) {
      return {
        unitPrice: lowest.price,
        supplier: lowest.name,
        sku: lowest.sku || undefined,
      };
    }

    return null;
  }

  /**
   * Determine if a line item is labor
   */
  private isLaborItem(item: LineItem): boolean {
    const description = item.description.toLowerCase();

    // Check for labor indicators
    for (const indicator of LABOR_INDICATORS) {
      if (description.includes(indicator)) {
        return true;
      }
    }

    // Check unit - labor is often measured in hours or SQ (for roofing labor)
    const unit = item.unit.toLowerCase();
    if (unit === "hr" || unit === "hour" || unit === "man-hour") {
      return true;
    }

    // Items with "labor" in category
    if (item.category.toLowerCase() === "labor") {
      return true;
    }

    return false;
  }

  /**
   * Calculate material quantities based on roof measurements
   */
  calculateMaterialQuantities(measurements: {
    totalArea: number;
    ridge: number;
    hip: number;
    valley: number;
    eave: number;
    rake: number;
    wastePercent?: number;
  }): Record<string, { quantity: number; unit: string }> {
    const waste = measurements.wastePercent || 0.1; // 10% default waste

    // Convert sq ft to squares (1 square = 100 sq ft)
    const squares = measurements.totalArea / 100;
    const squaresWithWaste = squares * (1 + waste);

    return {
      // Shingles: 3 bundles per square
      shingles: { quantity: Math.ceil(squaresWithWaste * 3), unit: "bundle" },

      // Underlayment: 1 roll covers ~400 sq ft
      underlayment: { quantity: Math.ceil(measurements.totalArea / 400), unit: "roll" },

      // Starter strip: 1 per eave foot
      starter: { quantity: Math.ceil(measurements.eave / 100), unit: "bundle" },

      // Hip & ridge: 1 bundle per 20 LF
      hipRidge: {
        quantity: Math.ceil((measurements.ridge + measurements.hip) / 20),
        unit: "bundle",
      },

      // Drip edge: 1 piece per 10 LF
      dripEdge: {
        quantity: Math.ceil((measurements.eave + measurements.rake) / 10),
        unit: "piece",
      },

      // Ice & water barrier: 1 roll per 65 LF (for first 3 feet at eaves)
      iceWater: { quantity: Math.ceil((measurements.eave * 3) / 65), unit: "roll" },

      // Valley metal: 1 piece per 10 LF
      valleyMetal: { quantity: Math.ceil(measurements.valley / 10), unit: "piece" },

      // Nails: 4 per sq ft (1 coil per 120 sq ft)
      nails: { quantity: Math.ceil(measurements.totalArea / 120), unit: "coil" },
    };
  }
}
