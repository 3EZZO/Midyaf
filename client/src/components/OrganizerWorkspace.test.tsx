import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@shared/domain';
import type { OrganizationDto } from '@shared/overhaul';
import { testEvent } from '../lib/workspaceWorkflow.test';

const owner = [{ id: 'org_test', name: 'Synthetic Co', myRole: 'OWNER', kind: 'ORGANIZER_COMPANY' }];
const state = vi.hoisted(() => ({ orgs: undefined as unknown, events: undefined as unknown }));
const defaultEvents = () => ({ data: { events: [testEvent, { ...testEvent, id: 'active', operationalStatus: 'ACTIVE' }, { ...testEvent, id: 'past', operationalStatus: 'COMPLETED' }] } });
vi.mock('../lib/workspaceApi', () => ({
  useWorkspaceResource: (_token: string, path: string) =>
    path === '/onboarding/applications' ? { data: { applications: [] } }
      : path === '/events' ? (state.events ?? defaultEvents())
        : (state.orgs ?? { data: { organizations: owner } }),
  workspaceRequest: vi.fn()
}));
import {
  EVENT_ACCESS_NOTE_ID,
  EVENT_SETUP_ANCHOR_ID,
  EventSetupForm,
  NEW_EVENT_LABEL_AR,
  NEW_EVENT_LABEL_EN,
  NO_NEW_EVENT_REQUEST,
  NewEventButton,
  NewEventWaiting,
  OrganizerWorkspace,
  SelectedEventHeader,
  acknowledgeNewEventRequest,
  canCreateEvents,
  creatableOrganizations,
  issueNewEventRequest,
  newEventEntryState,
  pendingNewEventRequest,
  resolveNewEventRequest,
  shouldTakeNewEventRequest,
  withdrawNewEventRequest
} from './OrganizerWorkspace';

const session = { accessToken: 'synthetic', refreshToken: 'synthetic', user: { id: 'synthetic-user', role: 'ORGANIZER', name: 'Synthetic organizer', email: 'synthetic@example.test', phone: '', language: 'en' } } satisfies Session;
const organizations = owner as unknown as OrganizationDto[];
const org = (myRole: string | null, kind = 'ORGANIZER_COMPANY') => ({ id: `org-${myRole}-${kind}`, name: 'Synthetic org', kind, myRole }) as unknown as OrganizationDto;
/** The rendered new-event action button (opening tag). */
const actionTag = (html: string) => html.match(/<button[^>]*data-new-event-action="[^"]*"[^>]*>/)?.[0] ?? '';

afterEach(() => { state.orgs = undefined; state.events = undefined; });

describe('organizer event workspace', () => {
  it('shows categorized existing events, each visibly selectable for viewing and editing', () => {
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
    expect(html).toContain('Under planning (1)'); expect(html).toContain('Active (1)'); expect(html).toContain('Completed (1)'); expect(html).toContain('24');
    expect(html.match(/data-event-card=/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Open and edit: ');
    expect(html).toContain('Open &amp; edit →');
    // The form opens on demand; the dashboard itself carries no second creation form.
    expect(html).not.toContain('data-event-setup');
  });

  it('requires authentication and renders the Arabic entry', () => {
    expect(renderToStaticMarkup(<OrganizerWorkspace isArabic={false} />)).toContain('Sign in');
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic />);
    expect(html).toContain(NEW_EVENT_LABEL_AR); expect(html).toContain('فتح وتعديل'); expect(html).toContain('dir="rtl"');
  });

  it('shows an honest empty state that points to the action', () => {
    state.events = { data: { events: [] } };
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
    expect(html).toContain('data-events-empty');
    expect(html).toContain(`Start with «${NEW_EVENT_LABEL_EN}».`);
    expect(html).not.toContain('data-event-card');
  });

  it('shows loading and error states instead of invented events', () => {
    state.events = {}; state.orgs = {};
    const loading = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
    expect(loading).toContain('role="status"'); expect(loading).not.toContain('data-event-card');
    state.events = { error: 'Events unavailable' }; state.orgs = { error: 'Organizations unavailable' };
    const failed = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
    expect(failed).toMatch(/role="alert"[^>]*>Events unavailable</);
    expect(actionTag(failed)).toContain('disabled=""');
  });
});

describe('New event / activity action', () => {
  it('is a prominent, enabled control for organization owners/admins that controls the canonical form', () => {
    for (const [isArabic, label] of [[false, NEW_EVENT_LABEL_EN], [true, NEW_EVENT_LABEL_AR]] as const) {
      const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={isArabic} />);
      const tag = actionTag(html);
      expect(tag).toContain('data-new-event-action="create"');
      expect(tag).not.toContain('disabled=""');
      expect(tag).toContain(`aria-controls="${EVENT_SETUP_ANCHOR_ID}"`);
      expect(tag).toContain('aria-expanded="false"');
      expect(html).toContain(label);
      expect(html).not.toContain('data-intake-no-access');
    }
  });

  it('without creation rights explains the required role and offers no enabled form', () => {
    for (const myRole of ['MEMBER', null]) {
      state.orgs = { data: { organizations: [org(myRole), org('OWNER', 'VENDOR')] } };
      const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
      const tag = actionTag(html);
      expect(tag).toContain('data-new-event-action="no-access"');
      expect(tag).toContain('disabled=""');
      expect(tag).toContain(`aria-describedby="${EVENT_ACCESS_NOTE_ID}"`);
      expect(tag).not.toContain('aria-controls');
      const note = html.match(/<p role="note" id="organizer-event-access"[^>]*>([^<]*)<\/p>/)?.[1] ?? '';
      expect(note).toContain('not an owner or admin of an organizing company');
      expect(note).toContain('Ask the Midyaf Super Admin');
      expect(note).not.toMatch(/success|created|granted/i);
      // No canonical event-setup form or enabled create action. (The separate
      // vendor/client registration form of OnboardingWorkspace is unrelated.)
      expect(html).not.toContain('data-event-setup');
      expect(html).not.toContain(`id="${EVENT_SETUP_ANCHOR_ID}"`);
      expect(html).not.toContain('data-new-event-action="create"');
      expect(html).not.toContain('Save &amp; open event plan');
    }
    state.orgs = { data: { organizations: [org('MEMBER')] } };
    expect(renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic />)).toContain('ليس مالكاً أو مديراً');
  });

  it('can leave the button to a parent hero while still explaining missing access', () => {
    expect(renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} showNewEventButton={false} />)).not.toContain('data-new-event-action');
    state.orgs = { data: { organizations: [org('MEMBER')] } };
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} showNewEventButton={false} />);
    expect(html).not.toContain('data-new-event-action');
    expect(html).toContain(`id="${EVENT_ACCESS_NOTE_ID}"`);
  });

  it('waits while access is loading: disabled, busy and without a premature explanation', () => {
    state.orgs = {};
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} />);
    expect(actionTag(html)).toContain('data-new-event-action="loading"');
    expect(actionTag(html)).toContain('disabled=""');
    expect(actionTag(html)).toContain('aria-busy="true"');
    expect(html).not.toContain('data-intake-no-access');
  });

  it('mirrors the server creation rule without granting anything', () => {
    expect(canCreateEvents([org('OWNER')])).toBe(true);
    expect(canCreateEvents([org('ADMIN')])).toBe(true);
    expect(canCreateEvents([org('MEMBER'), org(null)])).toBe(false);
    expect(canCreateEvents([org('OWNER', 'VENDOR')])).toBe(false);
    expect(creatableOrganizations([org('ADMIN'), org('MEMBER')]).map(o => o.myRole)).toEqual(['ADMIN']);
  });

  it('resolves each request predictably: open + focus the form, focus the explanation, or wait', () => {
    const owners = { data: { organizations: [org('OWNER')] } };
    const members = { data: { organizations: [org('MEMBER')] } };
    expect(newEventEntryState({})).toBe('loading');
    expect(newEventEntryState({ error: 'x' })).toBe('error');
    expect(newEventEntryState(owners)).toBe('create');
    expect(newEventEntryState(members)).toBe('no-access');
    expect(resolveNewEventRequest('create')).toEqual({ pending: false, openForm: true, focus: 'form', notice: null });
    expect(resolveNewEventRequest('no-access')).toEqual({ pending: false, openForm: false, focus: 'access-note', notice: 'no-access' });
    expect(resolveNewEventRequest('error')).toEqual({ pending: false, openForm: false, focus: 'access-note', notice: 'error' });
    expect(resolveNewEventRequest('loading')).toEqual({ pending: true, openForm: false, focus: null, notice: null });
  });

  it('holds a request made while access is loading and resolves it once loaded', () => {
    // The request waits (no form, no notice) and then follows the loaded access.
    const waiting = resolveNewEventRequest(newEventEntryState({}));
    expect(waiting).toMatchObject({ pending: true, openForm: false, notice: null });
    expect(resolveNewEventRequest(newEventEntryState({ data: { organizations: [org('ADMIN')] } }))).toMatchObject({ pending: false, openForm: true, focus: 'form' });
    expect(resolveNewEventRequest(newEventEntryState({ data: { organizations: [org('MEMBER')] } }))).toMatchObject({ pending: false, openForm: false, notice: 'no-access' });
    expect(resolveNewEventRequest(newEventEntryState({ error: 'Organizations unavailable' }))).toMatchObject({ pending: false, openForm: false, notice: 'error' });
    expect(renderToStaticMarkup(<NewEventWaiting isArabic={false} />)).toMatch(/role="status"[^>]*>Checking your access for «New event \/ activity»…</);
  });

  it('gives the organizations error a visible, focusable anchor in the list and no form', () => {
    state.orgs = { error: 'Organizations unavailable' };
    const html = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic={false} showNewEventButton={false} />);
    const alert = html.match(/<p role="alert" id="organizer-event-access" tabindex="-1"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '';
    expect(alert).toContain('data-intake-access-error');
    expect(alert).toContain('Your organizations could not be loaded');
    expect(alert).toContain('Organizations unavailable');
    expect(html).not.toContain('data-event-setup');
    expect(html).not.toContain('data-intake-no-access');
    // With its own button, the disabled action is described by that alert.
    const withButton = renderToStaticMarkup(<OrganizerWorkspace session={session} isArabic />);
    expect(actionTag(withButton)).toContain(`aria-describedby="${EVENT_ACCESS_NOTE_ID}"`);
    expect(withButton).toContain('تعذر تحميل مؤسساتك');
  });

  it('calls its handler on click and is inert when not allowed', () => {
    const onClick = vi.fn();
    const allowed = NewEventButton({ state: 'create', isArabic: false, expanded: true, onClick });
    expect(allowed.props.disabled).toBe(false);
    expect(allowed.props['aria-expanded']).toBe(true);
    allowed.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
    const denied = NewEventButton({ state: 'no-access', isArabic: true, expanded: false, onClick });
    expect(denied.props.disabled).toBe(true);
    expect(denied.props.children).toBe(NEW_EVENT_LABEL_AR);
  });
});

/**
 * R1: the parent shortcut's request is one-shot and session-scoped. There is
 * no DOM environment here, so the parent/workspace protocol is exercised
 * through the same pure functions the hook and the workspace effect use; the
 * effects themselves are left to the interactive visual check.
 */
describe('one-shot, session-scoped new-event request', () => {
  /** A mounted workspace instance: what it has taken over so far. */
  const mountWorkspace = () => ({ lastTaken: 0, taken: [] as number[] });
  /** The workspace effect: take a fresh request once and acknowledge it. */
  function workspaceSees(ws: ReturnType<typeof mountWorkspace>, request: number, acknowledge: (id: number) => void) {
    if (!shouldTakeNewEventRequest(request, ws.lastTaken)) return;
    ws.lastTaken = request; ws.taken.push(request); acknowledge(request);
  }

  it('is taken on first mount (e.g. switching from Fleet/Contracts to Intake) and not replayed after leaving and returning', () => {
    let parent = issueNewEventRequest(NO_NEW_EVENT_REQUEST, 'session-a');
    const ack = (id: number) => { parent = acknowledgeNewEventRequest(parent, id); };
    const first = mountWorkspace();
    workspaceSees(first, pendingNewEventRequest(parent, 'session-a'), ack);
    expect(first.taken).toEqual([1]);
    expect(pendingNewEventRequest(parent, 'session-a')).toBe(0);
    // Re-renders of the same instance do not take it twice.
    workspaceSees(first, 1, ack);
    expect(first.taken).toEqual([1]);

    // Leaving Intake unmounts the workspace; returning mounts a fresh one.
    const returned = mountWorkspace();
    workspaceSees(returned, pendingNewEventRequest(parent, 'session-a'), ack);
    expect(returned.taken).toEqual([]);

    // A new press is a new request and is taken again.
    parent = issueNewEventRequest(parent, 'session-a');
    workspaceSees(returned, pendingNewEventRequest(parent, 'session-a'), ack);
    expect(returned.taken).toEqual([2]);
  });

  it('never carries a request across a session or actor change', () => {
    const parent = issueNewEventRequest(NO_NEW_EVENT_REQUEST, 'session-a');
    expect(pendingNewEventRequest(parent, 'session-a')).toBe(1);
    expect(pendingNewEventRequest(parent, 'session-b')).toBe(0);
    expect(pendingNewEventRequest(parent, null)).toBe(0);
    const other = mountWorkspace();
    workspaceSees(other, pendingNewEventRequest(parent, 'session-b'), () => {});
    expect(other.taken).toEqual([]);
    // A request issued while signed out never reaches a later session.
    expect(pendingNewEventRequest(issueNewEventRequest(NO_NEW_EVENT_REQUEST, null), 'session-a')).toBe(0);
  });

  it('acknowledges only the request taken, and can be withdrawn', () => {
    const twice = issueNewEventRequest(issueNewEventRequest(NO_NEW_EVENT_REQUEST, 's'), 's');
    expect(pendingNewEventRequest(acknowledgeNewEventRequest(twice, 1), 's')).toBe(2);
    expect(pendingNewEventRequest(acknowledgeNewEventRequest(twice, 2), 's')).toBe(0);
    expect(pendingNewEventRequest(withdrawNewEventRequest(twice), 's')).toBe(0);
    expect(shouldTakeNewEventRequest(0, 0)).toBe(false);
  });
});

describe('request feedback over an already selected event', () => {
  const header = (props: Partial<Parameters<typeof SelectedEventHeader>[0]>) =>
    renderToStaticMarkup(<SelectedEventHeader isArabic={false} eventName="Synthetic summit" onBack={() => {}} onDismissNotice={() => {}} {...props} />);

  it('shows and anchors the role explanation above the open event, which stays selected, with no form', () => {
    const html = header({ notice: 'no-access' });
    expect(html).toContain('data-selected-event-notice="no-access"');
    expect(html).toMatch(/<p role="note" id="organizer-event-access" tabindex="-1"/);
    expect(html).toContain('not an owner or admin of an organizing company');
    expect(html).toContain('Selected for viewing and editing:');
    expect(html).toContain('Synthetic summit');
    expect(html).toContain('Dismiss');
    expect(html).not.toContain('data-event-setup');
    expect(html.indexOf('data-selected-event-notice')).toBeLessThan(html.indexOf('data-selected-event="true"'));
    expect(html.indexOf('data-selected-event="true"')).toBeGreaterThan(-1);
  });

  it('shows and anchors the loading error the same way, in both languages', () => {
    const html = header({ notice: 'error', noticeMessage: 'Organizations unavailable' });
    expect(html).toMatch(/<p role="alert" id="organizer-event-access" tabindex="-1"/);
    expect(html).toContain('Organizations unavailable');
    expect(header({ notice: 'error', isArabic: true })).toContain('تعذر تحميل مؤسساتك');
  });

  it('shows a status while the request waits for access, and nothing without a request', () => {
    expect(header({ waiting: true })).toContain('data-new-event-waiting');
    const plain = header({});
    expect(plain).not.toContain('organizer-event-access');
    expect(plain).not.toContain('data-new-event-waiting');
    expect(plain).toContain('All events');
  });
});

describe('canonical event setup form', () => {
  it('embeds the single setup form under the exact Arabic heading in both languages', () => {
    for (const isArabic of [true, false]) {
      const html = renderToStaticMarkup(<EventSetupForm organizations={organizations} busy={false} isArabic={isArabic} onSubmit={() => {}} />);
      const heading = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '';
      expect(heading).toContain('<span lang="ar" dir="rtl">إدخال وتجهيز فعالية جديدة</span>');
      expect(html).toContain(`id="${EVENT_SETUP_ANCHOR_ID}"`);
      expect(html.match(/<form/g)).toHaveLength(1);
      expect(html.indexOf('<form')).toBeGreaterThan(html.indexOf('إدخال وتجهيز فعالية جديدة'));
      for (const name of ['organizationId', 'name', 'locationLabel', 'hotelZone', 'planningMode', 'vipGuestCount', 'regularGuestCount', 'carCount', 'startAt', 'endAt', 'arrivalStartAt', 'departureEndAt']) expect(html).toContain(`name="${name}"`);
      // Assisted planning is the default and is described as advisory with human approval.
      expect(html).toMatch(/<option value="AI" selected="">/);
    }
    expect(renderToStaticMarkup(<EventSetupForm organizations={organizations} busy isArabic={false} onSubmit={() => {}} />)).toMatch(/<button[^>]*disabled=""[^>]*>Saving &amp; preparing the plan…<\/button>/);
  });

  it('offers a cancel control only when the workspace provides one', () => {
    expect(renderToStaticMarkup(<EventSetupForm organizations={organizations} busy={false} isArabic={false} onSubmit={() => {}} />)).not.toContain('Cancel');
    expect(renderToStaticMarkup(<EventSetupForm organizations={organizations} busy={false} isArabic onSubmit={() => {}} onCancel={() => {}} />)).toContain('إلغاء');
  });
});
