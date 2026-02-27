/**
 * Moment Repositories – PostgreSQL Implementation (Stub)
 *
 * Placeholder for migration 0008_moments.sql integration.
 * To be implemented when migration is applied to production database.
 */

import type { MomentRepository, MomentReactionRepository } from "../repositories";
import type { DbMoment, DbMomentReaction } from "../types";

export function createMomentRepository(): MomentRepository {
  return {
    async findById() {
      return null;
    },
    async findByFamilyId() {
      return [];
    },
    async findByFamilyIdOrderedByRecent() {
      return [];
    },
    async create(data) {
      return data as DbMoment;
    },
    async update(_id, data) {
      return data as DbMoment;
    },
    async delete() {
      return true;
    },
  };
}

export function createMomentReactionRepository(): MomentReactionRepository {
  return {
    async findById() {
      return null;
    },
    async findByMomentId() {
      return [];
    },
    async findByMomentIdAndParentId() {
      return null;
    },
    async create(data) {
      return data as DbMomentReaction;
    },
    async delete() {
      return true;
    },
    async deleteByMomentIdAndParentId() {
      return true;
    },
  };
}
