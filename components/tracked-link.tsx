"use client";import Link from "next/link";import type{ComponentProps}from"react";import{track,type EventName}from"@/lib/analytics";
export function TrackedLink({event,...props}:ComponentProps<typeof Link>&{event:EventName}){return <Link {...props} onClick={e=>{track(event);props.onClick?.(e)}}/>}
