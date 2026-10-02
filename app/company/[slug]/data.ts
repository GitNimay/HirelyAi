import { cache } from "react";
import { getCompany } from "@/lib/companies";

/** The layout and the tab page both need the company: one query per request. */
export const companyFor = cache((viewerId: string, ref: string) => getCompany(viewerId, ref));
export const slugOf = async (params: Promise<{ slug: string }>) => decodeURIComponent((await params).slug);
