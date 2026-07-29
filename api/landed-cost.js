import { ApiError, assertMethod, sendJson, withApiErrors } from "./_lib/http.js";
import { calculateOfferLandedCosts } from "./_lib/landed-cost.js";
import { listLogisticsZones } from "./_lib/logistics.js";
import { listProductOffers } from "./_lib/product-offers.js";
import { oneOf, text } from "./_lib/validation.js";

export const parseLandedCostQuantity = (value) => {
  const quantity = Number(String(value ?? "1").replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new ApiError(400, "validation_error", "Müqayisə miqdarı 0-dan böyük olmalıdır.");
  }
  return Math.round(quantity * 1_000) / 1_000;
};

export default withApiErrors(async (req, res) => {
  assertMethod(req, ["GET"]);
  const productId = text(req.query.productId, { field: "Məhsul", required: true, max: 160 });
  const city = text(req.query.city, { field: "Şəhər", required: true, max: 160 });
  const quantity = parseLandedCostQuantity(req.query.quantity);
  const mode = oneOf(
    req.query.mode,
    ["delivery", "pickup", "supplier_delivery"],
    "delivery",
    "Çatdırılma üsulu"
  );
  const [offers, zones] = await Promise.all([
    listProductOffers(productId),
    listLogisticsZones()
  ]);
  const landedOffers = calculateOfferLandedCosts({ offers, zones, city, mode, quantity });
  return sendJson(res, 200, {
    ok: true,
    data: {
      productId,
      city,
      mode,
      quantity,
      bestOfferId: landedOffers.find((offer) => offer.recommended)?.id || null,
      offers: landedOffers
    }
  });
});
