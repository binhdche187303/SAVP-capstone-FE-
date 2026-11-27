import {
  defaultKtlLayout,
  KTL_GATE_FLOOR_KEY,
  KTL_LAYOUT_BY_CODE,
} from "./ktlLayoutDefaults";

describe("KTL camera layout defaults", () => {
  test("khai báo đủ 32 camera AI trong file CameraAI.xlsx", () => {
    expect(Object.keys(KTL_LAYOUT_BY_CODE)).toHaveLength(32);
  });

  test("đặt camera theo mã, không phụ thuộc hoa thường hay thứ tự API", () => {
    const devices = [
      { id: "b", device_code: "gate2-4" },
      { id: "a", device_code: "Gate2-1" },
      { id: "other", device_code: "CAMERA-DEMO" },
    ];

    expect(defaultKtlLayout(devices, KTL_GATE_FLOOR_KEY)).toEqual({
      b: { x: 269, y: 544, angle: 45 },
      a: { x: 208, y: 526, angle: 225 },
    });
  });

  test("không đưa camera sang sai tầng", () => {
    const devices = [
      { id: "g1", device_code: "G-1" },
      { id: "t1", device_code: "T1-1" },
    ];

    expect(defaultKtlLayout(devices, "A1 - Tầng G")).toEqual({
      g1: { x: 177, y: 173, angle: 180 },
    });
  });
});
