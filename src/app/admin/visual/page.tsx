import { redirect } from 'next/navigation';

/** Compatibility route for old bookmarks; Appearance is the sole visual entry. */
export default function LegacyVisualRoute() {
  redirect('/admin/aparencia');
}
