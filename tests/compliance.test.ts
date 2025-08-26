// compliance.test.ts

import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Rule {
  ruleType: number;
  description: string;
  minValue?: number;
  maxValue?: number;
  allowedCategories: string[];
  maxDuration?: number;
  active: boolean;
}

interface Standard {
  name: string;
  description: string;
}

interface Verification {
  timestamp: number;
  standardId: number;
  passed: boolean;
  failedRules: number[];
  dataHash: string;
}

interface CropCompliance {
  compliant: boolean;
  lastVerified: number;
}

interface ContractState {
  admin: string;
  paused: boolean;
  ruleVersion: number;
  standards: Map<number, Standard>;
  rules: Map<string, Rule>; // key: `${standardId}-${ruleId}`
  verifications: Map<string, Verification>; // key: `${cropId}-${verificationId}`
  cropCompliance: Map<string, CropCompliance>; // key: `${cropId}-${standardId}`
}

// Mock contract implementation
class ComplianceContractMock {
  private state: ContractState = {
    admin: "deployer",
    paused: false,
    ruleVersion: 1,
    standards: new Map(),
    rules: new Map(),
    verifications: new Map(),
    cropCompliance: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_RULE = 101;
  private ERR_NO_RULE_FOUND = 102;
  private ERR_INVALID_DATA = 103;
  private ERR_RULE_EXISTS = 104;
  private ERR_INVALID_STANDARD = 105;
  private ERR_PAUSED = 106;
  private ERR_INVALID_THRESHOLD = 107;
  private ERR_INVALID_CATEGORY = 108;
  private ERR_VERIFICATION_FAILED = 109;
  private ERR_INVALID_VERSION = 110;
  private ERR_NO_CROP_REGISTERED = 111;
  private ERR_INVALID_TIMESTAMP = 112;

  private blockHeight = 100; // Mock block height

  private getRuleKey(standardId: number, ruleId: number): string {
    return `${standardId}-${ruleId}`;
  }

  private getVerificationKey(cropId: string, verificationId: number): string {
    return `${cropId}-${verificationId}`;
  }

  private getCropComplianceKey(cropId: string, standardId: number): string {
    return `${cropId}-${standardId}`;
  }

  private isAdmin(caller: string): boolean {
    return caller === this.state.admin;
  }

  private validateNumericalRule(rule: Rule, value: number): boolean {
    if (rule.minValue === undefined || rule.maxValue === undefined) return false;
    return value >= rule.minValue && value <= rule.maxValue;
  }

  private validateCategoricalRule(rule: Rule, category: string): boolean {
    return rule.allowedCategories.includes(category);
  }

  private validateTemporalRule(rule: Rule, duration: number): boolean {
    if (rule.maxDuration === undefined) return false;
    return duration <= rule.maxDuration;
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  addStandard(caller: string, standardId: number, name: string, description: string): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.state.standards.has(standardId)) {
      return { ok: false, value: this.ERR_RULE_EXISTS };
    }
    this.state.standards.set(standardId, { name, description });
    return { ok: true, value: true };
  }

  addNumericalRule(caller: string, standardId: number, ruleId: number, description: string, minValue: number, maxValue: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!this.state.standards.has(standardId)) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    const key = this.getRuleKey(standardId, ruleId);
    if (this.state.rules.has(key)) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    if (minValue > maxValue) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    this.state.rules.set(key, {
      ruleType: 0,
      description,
      minValue,
      maxValue,
      allowedCategories: [],
      active: true,
    });
    return { ok: true, value: true };
  }

  addCategoricalRule(caller: string, standardId: number, ruleId: number, description: string, allowedCategories: string[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!this.state.standards.has(standardId)) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    const key = this.getRuleKey(standardId, ruleId);
    if (this.state.rules.has(key) || allowedCategories.length === 0) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    this.state.rules.set(key, {
      ruleType: 1,
      description,
      allowedCategories,
      active: true,
    });
    return { ok: true, value: true };
  }

  addTemporalRule(caller: string, standardId: number, ruleId: number, description: string, maxDuration: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!this.state.standards.has(standardId)) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    const key = this.getRuleKey(standardId, ruleId);
    if (this.state.rules.has(key) || maxDuration <= 0) {
      return { ok: false, value: this.ERR_INVALID_RULE };
    }
    this.state.rules.set(key, {
      ruleType: 2,
      description,
      maxDuration,
      allowedCategories: [],
      active: true,
    });
    return { ok: true, value: true };
  }

  deactivateRule(caller: string, standardId: number, ruleId: number): ClarityResponse<boolean> {
    if (!this.isAdmin(caller)) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    const key = this.getRuleKey(standardId, ruleId);
    const rule = this.state.rules.get(key);
    if (!rule) {
      return { ok: false, value: this.ERR_NO_RULE_FOUND };
    }
    rule.active = false;
    this.state.rules.set(key, rule);
    return { ok: true, value: true };
  }

  verifyCompliance(
    caller: string,
    cropId: string,
    standardId: number,
    data: { numericalValue: number; category: string; duration: number; dataHash: string }
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (!this.state.standards.has(standardId)) {
      return { ok: false, value: this.ERR_INVALID_STANDARD };
    }
    // Assume crop exists for mock
    const verificationId = this.state.ruleVersion + 1;
    const failedRules: number[] = [];
    let passed = true;

    // Check up to 3 rules as in contract
    for (let ruleId = 1; ruleId <= 3; ruleId++) {
      const key = this.getRuleKey(standardId, ruleId);
      const rule = this.state.rules.get(key);
      if (rule && rule.active) {
        let valid = false;
        if (rule.ruleType === 0) {
          valid = this.validateNumericalRule(rule, data.numericalValue);
        } else if (rule.ruleType === 1) {
          valid = this.validateCategoricalRule(rule, data.category);
        } else if (rule.ruleType === 2) {
          valid = this.validateTemporalRule(rule, data.duration);
        }
        if (!valid) {
          failedRules.push(ruleId);
          passed = false;
        }
      }
    }

    const vKey = this.getVerificationKey(cropId, verificationId);
    this.state.verifications.set(vKey, {
      timestamp: this.blockHeight,
      standardId,
      passed,
      failedRules,
      dataHash: data.dataHash,
    });

    const cKey = this.getCropComplianceKey(cropId, standardId);
    this.state.cropCompliance.set(cKey, {
      compliant: passed,
      lastVerified: this.blockHeight,
    });

    this.state.ruleVersion = verificationId;

    return passed ? { ok: true, value: true } : { ok: false, value: this.ERR_VERIFICATION_FAILED };
  }

  getStandard(standardId: number): ClarityResponse<Standard | null> {
    return { ok: true, value: this.state.standards.get(standardId) ?? null };
  }

  getRule(standardId: number, ruleId: number): ClarityResponse<Rule | null> {
    const key = this.getRuleKey(standardId, ruleId);
    return { ok: true, value: this.state.rules.get(key) ?? null };
  }

  getVerification(cropId: string, verificationId: number): ClarityResponse<Verification | null> {
    const key = this.getVerificationKey(cropId, verificationId);
    return { ok: true, value: this.state.verifications.get(key) ?? null };
  }

  getCropCompliance(cropId: string, standardId: number): ClarityResponse<CropCompliance | null> {
    const key = this.getCropComplianceKey(cropId, standardId);
    return { ok: true, value: this.state.cropCompliance.get(key) ?? null };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getContractAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  getCurrentVersion(): ClarityResponse<number> {
    return { ok: true, value: this.state.ruleVersion };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  admin: "wallet_1",
  user: "wallet_2",
};

describe("ComplianceContract", () => {
  let contract: ComplianceContractMock;

  beforeEach(() => {
    contract = new ComplianceContractMock();
    vi.resetAllMocks();
  });

  it("should allow admin to set new admin", () => {
    const result = contract.setAdmin(accounts.deployer, accounts.admin);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getContractAdmin()).toEqual({ ok: true, value: accounts.admin });
  });

  it("should prevent non-admin from setting admin", () => {
    const result = contract.setAdmin(accounts.user, accounts.admin);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: true });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isContractPaused()).toEqual({ ok: true, value: false });
  });

  it("should allow admin to add standard", () => {
    const addResult = contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    expect(addResult).toEqual({ ok: true, value: true });
    const standard = contract.getStandard(1);
    expect(standard).toEqual({
      ok: true,
      value: { name: "USDA", description: "USDA GMO Standards" },
    });
  });

  it("should prevent adding duplicate standard", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    const duplicateResult = contract.addStandard(accounts.deployer, 1, "EU", "EU Standards");
    expect(duplicateResult).toEqual({ ok: false, value: 104 });
  });

  it("should allow adding numerical rule", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    const addRule = contract.addNumericalRule(accounts.deployer, 1, 1, "Pesticide Level", 0, 100);
    expect(addRule).toEqual({ ok: true, value: true });
    const rule = contract.getRule(1, 1);
    expect(rule).toEqual({
      ok: true,
      value: expect.objectContaining({
        ruleType: 0,
        minValue: 0,
        maxValue: 100,
        active: true,
      }),
    });
  });

  it("should prevent invalid numerical rule", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    const invalidRule = contract.addNumericalRule(accounts.deployer, 1, 1, "Invalid", 100, 0);
    expect(invalidRule).toEqual({ ok: false, value: 101 });
  });

  it("should allow adding categorical rule", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    const addRule = contract.addCategoricalRule(accounts.deployer, 1, 2, "Gene Type", ["BT", "HT"]);
    expect(addRule).toEqual({ ok: true, value: true });
    const rule = contract.getRule(1, 2);
    expect(rule).toEqual({
      ok: true,
      value: expect.objectContaining({
        ruleType: 1,
        allowedCategories: ["BT", "HT"],
        active: true,
      }),
    });
  });

  it("should allow adding temporal rule", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    const addRule = contract.addTemporalRule(accounts.deployer, 1, 3, "Growth Period", 1000);
    expect(addRule).toEqual({ ok: true, value: true });
    const rule = contract.getRule(1, 3);
    expect(rule).toEqual({
      ok: true,
      value: expect.objectContaining({
        ruleType: 2,
        maxDuration: 1000,
        active: true,
      }),
    });
  });

  it("should deactivate rule", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    contract.addNumericalRule(accounts.deployer, 1, 1, "Pesticide Level", 0, 100);
    const deactivate = contract.deactivateRule(accounts.deployer, 1, 1);
    expect(deactivate).toEqual({ ok: true, value: true });
    const rule = contract.getRule(1, 1);
    expect(rule.value?.active).toBe(false);
  });

  it("should verify compliance successfully", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    contract.addNumericalRule(accounts.deployer, 1, 1, "Pesticide Level", 0, 100);
    contract.addCategoricalRule(accounts.deployer, 1, 2, "Gene Type", ["BT"]);
    contract.addTemporalRule(accounts.deployer, 1, 3, "Growth Period", 1000);

    const data = {
      numericalValue: 50,
      category: "BT",
      duration: 500,
      dataHash: "hash123",
    };
    const verifyResult = contract.verifyCompliance(accounts.user, "crop1", 1, data);
    expect(verifyResult).toEqual({ ok: true, value: true });

    const verification = contract.getVerification("crop1", 2);
    expect(verification).toEqual({
      ok: true,
      value: expect.objectContaining({
        passed: true,
        failedRules: [],
      }),
    });

    const compliance = contract.getCropCompliance("crop1", 1);
    expect(compliance).toEqual({
      ok: true,
      value: expect.objectContaining({
        compliant: true,
      }),
    });
  });

  it("should fail verification on invalid data", () => {
    contract.addStandard(accounts.deployer, 1, "USDA", "USDA GMO Standards");
    contract.addNumericalRule(accounts.deployer, 1, 1, "Pesticide Level", 0, 100);

    const data = {
      numericalValue: 150,
      category: "BT",
      duration: 500,
      dataHash: "hash123",
    };
    const verifyResult = contract.verifyCompliance(accounts.user, "crop1", 1, data);
    expect(verifyResult).toEqual({ ok: false, value: 109 });

    const verification = contract.getVerification("crop1", 2);
    expect(verification.value?.passed).toBe(false);
    expect(verification.value?.failedRules).toContain(1);
  });

  it("should prevent operations when paused", () => {
    contract.pauseContract(accounts.deployer);
    const addStandard = contract.addStandard(accounts.deployer, 1, "USDA", "Desc");
    expect(addStandard).toEqual({ ok: true, value: true }); // Pause doesn't affect addStandard in mock, but in contract it doesn't; adjust if needed.

    // But for rules:
    const addRule = contract.addNumericalRule(accounts.deployer, 1, 1, "Test", 0, 100);
    expect(addRule).toEqual({ ok: false, value: 106 });
  });
});