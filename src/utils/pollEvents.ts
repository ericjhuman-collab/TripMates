// Custom DOM events used to coordinate poll UI between components mounted
// at different parts of the React tree (PollBanner in Layout, Polls/Home
// view inside the Outlet). Avoids reliance on router timing for
// same-route updates.

export const OPEN_POLLS_EVENT = 'tripmates:open-polls';

export interface OpenPollsEventDetail {
    /** Optional poll id to scroll into view + highlight after switching tabs. */
    pollId?: string;
}
