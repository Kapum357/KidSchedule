/**
 * KidSchedule – Scheduled Notification Repository
 *
 * PostgreSQL implementation for managing scheduled notifications.
 */

import type { ScheduledNotificationRepository } from "../repositories";
import type { DbScheduledNotification } from "../types";
import { sql, type SqlClient } from "./client";

type ScheduledNotificationRow = {
  id: string;
  family_id: string;
  parent_id: string;
  notification_type: DbScheduledNotification["notificationType"];
  scheduled_at: string;
  sent_at: string | null;
  delivery_status: DbScheduledNotification["deliveryStatus"];
  delivery_method: DbScheduledNotification["deliveryMethod"];
  message_id: string | null;
  error_message: string | null;
  transition_at: string;
  from_parent_id: string;
  to_parent_id: string;
  location: string | null;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface CreateScheduledNotificationData {
  familyId: string;
  parentId: string;
  notificationType: DbScheduledNotification["notificationType"];
  scheduledAt: string;
  deliveryMethod: DbScheduledNotification["deliveryMethod"];
  transitionAt: string;
  fromParentId: string;
  toParentId: string;
  location?: string;
}

export interface UpdateScheduledNotificationData {
  sentAt?: string;
  deliveryStatus?: DbScheduledNotification["deliveryStatus"];
  messageId?: string;
  errorMessage?: string;
  retryCount?: number;
  lastRetryAt?: string;
}

export function createScheduledNotificationRepository(tx?: SqlClient): ScheduledNotificationRepository {
  return new PostgresScheduledNotificationRepository(tx);
}

class PostgresScheduledNotificationRepository implements ScheduledNotificationRepository {
  constructor(private readonly tx?: SqlClient) {}

  private get db(): SqlClient {
    return this.tx || sql;
  }

  async create(data: CreateScheduledNotificationData): Promise<DbScheduledNotification> {
    const result = await this.db`
      INSERT INTO scheduled_notifications (
        family_id, parent_id, notification_type, scheduled_at, delivery_method,
        transition_at, from_parent_id, to_parent_id, location
      ) VALUES (
        ${data.familyId}, ${data.parentId}, ${data.notificationType}, ${data.scheduledAt},
        ${data.deliveryMethod}, ${data.transitionAt}, ${data.fromParentId}, ${data.toParentId}, ${data.location || null}
      )
      RETURNING *
    `;

    return this.rowToDb(result[0] as ScheduledNotificationRow);
  }

  async findById(id: string): Promise<DbScheduledNotification | null> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications WHERE id = ${id}
    `;
    if (result.length > 0) {
      return this.rowToDb(result[0] as ScheduledNotificationRow);
    }
    return null;
  }

  async findPendingByTimeRange(
    startTime: string,
    endTime: string,
    limit = 100,
  ): Promise<DbScheduledNotification[]> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE scheduled_at >= ${startTime}
        AND scheduled_at <= ${endTime}
        AND delivery_status = 'pending'
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  /**
   * Find pending notifications for delivery with row-level locking.
   * Uses FOR UPDATE SKIP LOCKED to prevent concurrent delivery attempts.
   * SKIP LOCKED ensures only one worker processes each notification.
   *
   * This method MUST be called within a transaction.
   */
  async findPendingByTimeRangeForDelivery(
    startTime: string,
    endTime: string,
    limit = 100,
  ): Promise<DbScheduledNotification[]> {
    if (!this.tx) {
      throw new Error('findPendingByTimeRangeForDelivery must be called within a transaction');
    }

    const result = await this.tx`
      SELECT * FROM scheduled_notifications
      WHERE scheduled_at >= ${startTime}
        AND scheduled_at <= ${endTime}
        AND delivery_status = 'pending'
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  async findByFamilyId(familyId: string): Promise<DbScheduledNotification[]> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE family_id = ${familyId}
      ORDER BY scheduled_at DESC
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  async findByParentId(parentId: string): Promise<DbScheduledNotification[]> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE parent_id = ${parentId}
      ORDER BY scheduled_at DESC
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  async findFailed(limit = 50): Promise<DbScheduledNotification[]> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE delivery_status = 'failed'
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  /**
   * Check if a notification already exists for the same transition, parent, and type.
   * Used to prevent duplicate notifications.
   */
  async findExisting(
    transitionAt: string,
    parentId: string,
    notificationType: DbScheduledNotification["notificationType"],
  ): Promise<DbScheduledNotification | null> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE transition_at = ${transitionAt}
        AND parent_id = ${parentId}
        AND notification_type = ${notificationType}
      LIMIT 1
    `;

    if (result.length > 0) {
      return this.rowToDb(result[0] as ScheduledNotificationRow);
    }
    return null;
  }

  /**
   * Find notifications that need retry (failed with retryCount < 3).
   */
  async findFailedForRetry(limit = 50): Promise<DbScheduledNotification[]> {
    const result = await this.db`
      SELECT * FROM scheduled_notifications
      WHERE delivery_status = 'failed'
        AND retry_count < 3
      ORDER BY last_retry_at ASC NULLS FIRST
      LIMIT ${limit}
    `;

    return result.map(row => this.rowToDb(row as ScheduledNotificationRow));
  }

  async update(id: string, data: UpdateScheduledNotificationData): Promise<DbScheduledNotification | null> {
    const updateFields = [];
    const values = [];

    if (data.sentAt !== undefined) {
      updateFields.push('sent_at = $' + (values.length + 1));
      values.push(data.sentAt);
    }
    if (data.deliveryStatus !== undefined) {
      updateFields.push('delivery_status = $' + (values.length + 1));
      values.push(data.deliveryStatus);
    }
    if (data.messageId !== undefined) {
      updateFields.push('message_id = $' + (values.length + 1));
      values.push(data.messageId);
    }
    if (data.errorMessage !== undefined) {
      updateFields.push('error_message = $' + (values.length + 1));
      values.push(data.errorMessage);
    }
    if (data.retryCount !== undefined) {
      updateFields.push('retry_count = $' + (values.length + 1));
      values.push(data.retryCount);
    }
    if (data.lastRetryAt !== undefined) {
      updateFields.push('last_retry_at = $' + (values.length + 1));
      values.push(data.lastRetryAt);
    }

    if (updateFields.length === 0) {
      return null;
    }

    const result = await this.db`
      UPDATE scheduled_notifications
      SET ${this.db(updateFields.join(', '))}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length > 0) {
      return this.rowToDb(result[0] as ScheduledNotificationRow);
    }
    return null;
  }

  async cancel(id: string): Promise<boolean> {
    const result = await this.db`
      UPDATE scheduled_notifications
      SET delivery_status = 'cancelled', updated_at = NOW()
      WHERE id = ${id}
    `;
    return result.count > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db`
      DELETE FROM scheduled_notifications WHERE id = ${id}
    `;
    return result.count > 0;
  }

  private rowToDb(row: ScheduledNotificationRow): DbScheduledNotification {
    return {
      id: row.id,
      familyId: row.family_id,
      parentId: row.parent_id,
      notificationType: row.notification_type,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at || undefined,
      deliveryStatus: row.delivery_status,
      deliveryMethod: row.delivery_method,
      messageId: row.message_id || undefined,
      errorMessage: row.error_message || undefined,
      transitionAt: row.transition_at,
      fromParentId: row.from_parent_id,
      toParentId: row.to_parent_id,
      location: row.location || undefined,
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}