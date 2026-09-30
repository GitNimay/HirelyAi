import { cache } from "react";
import { getProfile } from "@/lib/profile";

/** The layout and the tab page both need the profile: one query per request. */
export const profileFor = cache((viewerId: string, ref: string) => getProfile(viewerId, ref));
export const refOf = async (params: Promise<{ handle: string }>) => decodeURIComponent((await params).handle);
