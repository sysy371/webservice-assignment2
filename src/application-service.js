import { AppError, missing, forbidden, invalidState } from './errors.js';

export function createApplicationService(repo) {
  function transaction(work) {
    repo.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      repo.db.exec('COMMIT');
      return result;
    } catch (error) {
      repo.db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    apply(actor, eventId) {
      return transaction(() => {
        if (!repo.event(eventId)) throw missing('행사');
        if (actor.role !== 'STUDENT') throw forbidden();
        if (repo.existing(eventId, actor.id)) {
          throw new AppError(409, 'ALREADY_APPLIED', '이미 신청한 행사입니다.');
        }

        const application = repo.insert(eventId, actor.id);
        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'APPLY',
          fromStatus: null,
          toStatus: 'PENDING'
        });
        return application;
      });
    },
    cancel(actor, applicationId) {
      return transaction(() => {
        const application = repo.application(applicationId);
        if (!application) throw missing('신청');
        if (actor.role !== 'STUDENT' || application.userId !== actor.id) {
          throw forbidden();
        }
        if (application.status !== 'PENDING') throw invalidState();

        const cancelled = repo.setStatus(application.id, 'CANCELLED');
        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'CANCEL',
          fromStatus: application.status,
          toStatus: 'CANCELLED'
        });
        return cancelled;
      });
    },
    approve(actor, applicationId) {
      return transaction(() => {
        const application = repo.application(applicationId);
        if (!application) throw missing('신청');
        const event = repo.event(application.eventId);
        if (actor.role !== 'MANAGER' || event.managerId !== actor.id) {
          throw forbidden();
        }
        if (application.status !== 'PENDING') throw invalidState();
        if (repo.approvedCount(event.id) >= event.capacity) {
          throw new AppError(409, 'CAPACITY_FULL', '행사 승인 정원이 가득 찼습니다.');
        }

        const approved = repo.setStatus(application.id, 'APPROVED');
        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'APPROVE',
          fromStatus: application.status,
          toStatus: 'APPROVED'
        });
        return approved;
      });
    },
    revoke(actor, applicationId, reason) {
      return transaction(() => {
        const application = repo.application(applicationId);
        if (!application) throw missing('신청');
        const event = repo.event(application.eventId);
        if (actor.role !== 'MANAGER' || event.managerId !== actor.id) {
          throw forbidden();
        }
        if (application.status !== 'APPROVED') throw invalidState();

        const revoked = repo.setStatus(application.id, 'REVOKED');
        const revokeHistoryId = repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'REVOKE',
          fromStatus: application.status,
          toStatus: 'REVOKED',
          reason
        });

        const next = repo.nextPending(event.id);
        let promoted = null;
        if (next) {
          promoted = repo.setStatus(next.id, 'APPROVED');
          repo.addHistory({
            applicationId: next.id,
            actorId: actor.id,
            action: 'AUTO_APPROVE',
            fromStatus: next.status,
            toStatus: 'APPROVED',
            causeHistoryId: revokeHistoryId
          });
        }

        return { revoked, promoted };
      });
    }
  };
}
