import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sendToUser, sendToUsers } from './push';

// ── Chat: trips/{tripId}/messages/{msgId} ────────────────────────────────
export const onTripMessageCreated = onDocumentCreated(
    {
        document: 'trips/{tripId}/messages/{messageId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const msg = event.data?.data();
        if (!msg) return;
        const tripId = event.params.tripId;
        const senderId = String(msg.senderId ?? '');
        const senderName = String(msg.senderName ?? 'Someone');
        const text = String(msg.text ?? '');

        const db = getFirestore();
        const tripSnap = await db.doc(`trips/${tripId}`).get();
        const trip = tripSnap.data();
        if (!trip) return;
        const members = Array.isArray(trip.members) ? (trip.members as string[]) : [];
        const tripName = String(trip.name ?? 'Trip');

        await sendToUsers(
            members,
            'chat',
            {
                title: `${senderName} · ${tripName}`,
                body: text.length > 140 ? text.slice(0, 137) + '…' : text,
                data: { tripId, kind: 'chat' },
            },
            senderId,
        );
    },
);

// ── Trip invite created: tripInvites/{inviteId} ──────────────────────────
// Push the invitee the moment an admin sends an invite. Doc id is
// "{tripId}_{invitedUid}" (see services/tripInvites.ts).
export const onTripInviteCreated = onDocumentCreated(
    {
        document: 'tripInvites/{inviteId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const invite = event.data?.data();
        if (!invite) return;
        const invitedUid = String(invite.invitedUid ?? '');
        if (!invitedUid) return;
        const invitedByName = String(invite.invitedByName ?? 'Someone');
        const tripName = String(invite.tripName ?? 'a trip');
        const tripId = String(invite.tripId ?? '');

        await sendToUser(invitedUid, 'tripInvite', {
            title: 'Trip invite',
            body: `${invitedByName} invited you to ${tripName}.`,
            data: { kind: 'tripInvite', tripId, inviteId: event.params.inviteId },
        });
    },
);

// ── Trip member joined: notify the OTHER members (not the joiner) ────────
// Fires when someone is added to trips/{tripId}.members — typically after
// they accept a tripInvites/{...} invite. The joiner already knows they
// joined; the rest of the trip wants to see "X joined the trip."
export const onTripMembersChanged = onDocumentUpdated(
    {
        document: 'trips/{tripId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        if (!before || !after) return;
        const beforeMembers: string[] = Array.isArray(before.members) ? before.members : [];
        const afterMembers: string[] = Array.isArray(after.members) ? after.members : [];
        const added = afterMembers.filter(uid => !beforeMembers.includes(uid));
        if (added.length === 0) return;

        const tripId = event.params.tripId;
        const tripName = String(after.name ?? 'the trip');

        const db = getFirestore();
        await Promise.all(added.map(async (joinerUid) => {
            const joinerSnap = await db.doc(`users/${joinerUid}`).get();
            const joinerName = String(joinerSnap.data()?.name ?? 'Someone');

            // Recipients = current members minus the joiner themselves.
            const recipients = afterMembers.filter(uid => uid !== joinerUid);
            if (recipients.length === 0) return;

            await sendToUsers(recipients, 'tripInvite', {
                title: tripName,
                body: `${joinerName} joined the trip.`,
                data: { tripId, kind: 'tripInvite' },
            });
        }));
    },
);

// ── Polls: trips/{tripId}/polls/{pollId} created ─────────────────────────
export const onTripPollCreated = onDocumentCreated(
    {
        document: 'trips/{tripId}/polls/{pollId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const poll = event.data?.data();
        if (!poll) return;
        const tripId = event.params.tripId;
        const createdBy = String(poll.createdBy ?? '');
        const question = String(poll.question ?? 'New poll');

        const db = getFirestore();
        const tripSnap = await db.doc(`trips/${tripId}`).get();
        const trip = tripSnap.data();
        if (!trip) return;
        const members = Array.isArray(trip.members) ? (trip.members as string[]) : [];
        const tripName = String(trip.name ?? 'Trip');

        await sendToUsers(
            members,
            'polls',
            {
                title: `New poll · ${tripName}`,
                body: question,
                data: { tripId, kind: 'poll' },
            },
            createdBy,
        );
    },
);

// ── Games: odds/{sessionId} created (challenge sent) ─────────────────────
export const onOddsCreated = onDocumentCreated(
    {
        document: 'odds/{sessionId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const session = event.data?.data();
        if (!session) return;
        const challengerId = String(session.challengerId ?? '');
        const targetId = String(session.targetId ?? '');
        if (!targetId) return;

        const db = getFirestore();
        const challengerSnap = await db.doc(`users/${challengerId}`).get();
        const challengerName = String(challengerSnap.data()?.name ?? 'Someone');

        await sendToUser(targetId, 'games', {
            title: 'New odds challenge',
            body: `${challengerName} challenged you. Tap to play.`,
            data: { kind: 'odds', sessionId: event.params.sessionId },
        });
    },
);

// ── Games: odds/{sessionId} resolved ─────────────────────────────────────
export const onOddsResolved = onDocumentUpdated(
    {
        document: 'odds/{sessionId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        if (!before || !after) return;
        // Only push when state transitions into "resolved".
        if (before.state === 'resolved' || after.state !== 'resolved') return;

        const challengerId = String(after.challengerId ?? '');
        const targetId = String(after.targetId ?? '');
        const sessionId = event.params.sessionId;

        const db = getFirestore();
        const [challengerSnap, targetSnap] = await Promise.all([
            db.doc(`users/${challengerId}`).get(),
            db.doc(`users/${targetId}`).get(),
        ]);
        const challengerName = String(challengerSnap.data()?.name ?? 'Challenger');
        const targetName = String(targetSnap.data()?.name ?? 'Target');

        const matched = before.targetNumber != null && before.targetNumber === after.challengerNumber;
        const body = matched
            ? `${challengerName} & ${targetName} matched! Time to pay up.`
            : `${challengerName} & ${targetName} didn't match. Off the hook.`;

        await Promise.all([challengerId, targetId].filter(Boolean).map(uid =>
            sendToUser(uid, 'games', {
                title: 'Odds result',
                body,
                data: { kind: 'odds', sessionId },
            }),
        ));
    },
);

// ── Follow: users/{uid}/notifications/{notifId} created with type='follow' ──
export const onFollowNotificationCreated = onDocumentCreated(
    {
        document: 'users/{uid}/notifications/{notifId}',
        region: 'europe-west1',
        minInstances: 0,
    },
    async (event) => {
        const data = event.data?.data();
        if (!data || data.type !== 'follow') return;
        const targetUid = event.params.uid;
        const fromName = String(data.fromName ?? 'Someone');

        await sendToUser(targetUid, 'follow', {
            title: 'New follower',
            body: `${fromName} started following you.`,
            data: { kind: 'follow', fromUid: String(data.fromUid ?? '') },
        });
    },
);

// ── Activity reminders: scheduled tick, fires once per activity ──────────
//
// Strategy: run every 5 minutes. For each activity whose scheduledStartAt
// is between now+55min and now+65min AND whose `reminderSentAt` is unset,
// push to all attendees and stamp `reminderSentAt` to dedupe.
export const activityReminderTick = onSchedule(
    {
        schedule: 'every 5 minutes',
        timeZone: 'Etc/UTC',
        region: 'europe-west1',
        memory: '256MiB',
        timeoutSeconds: 120,
        minInstances: 0,
    },
    async () => {
        const db = getFirestore();
        const now = Date.now();
        const lower = Timestamp.fromMillis(now + 55 * 60 * 1000);
        const upper = Timestamp.fromMillis(now + 65 * 60 * 1000);

        const snap = await db.collection('activities')
            .where('scheduledStartAt', '>=', lower)
            .where('scheduledStartAt', '<=', upper)
            .get();

        if (snap.empty) return;

        for (const doc of snap.docs) {
            const a = doc.data();
            if (a.reminderSentAt) continue;

            const attendees: string[] = Array.isArray(a.attendees) ? a.attendees : [];
            if (attendees.length === 0) {
                // Stamp anyway so we don't reconsider this row every tick.
                await doc.ref.update({ reminderSentAt: Timestamp.now() }).catch(() => undefined);
                continue;
            }

            const title = String(a.title ?? 'Upcoming activity');
            const body = a.locationName
                ? `Starts in 1 hour at ${a.locationName}.`
                : 'Starts in 1 hour.';

            await sendToUsers(attendees, 'activityReminder', {
                title,
                body,
                data: {
                    kind: 'activityReminder',
                    activityId: doc.id,
                    tripId: String(a.tripId ?? ''),
                },
            });

            await doc.ref.update({ reminderSentAt: Timestamp.now() }).catch(() => undefined);
        }
    },
);
