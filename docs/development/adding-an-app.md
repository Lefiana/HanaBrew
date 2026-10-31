# Adding an application to the desktop

1. **Register it** in `apps/web/src/features/desktop/app-registry.ts` (`id`, `name`, `description`, `icon` key, `route` = `/apps/<id>`,
   `windowMode`, optional `defaultSize`, `pinned`). If it needs a new icon, add the key to `AppIconKey` and map it in `app-icons.tsx`.
2. **Map its component** in `features/desktop/app-components.tsx`: `APP_COMPONENTS[<id>] = YourApp`.
   Build the app under `features/<id>/`. It must render correctly at any size: it will be a window, a full page and a phone screen.
3. That's all the shell needs: the dock, launcher, `/apps/<id>` route and mobile navigation are derived from the registry.
4. Keep window concerns out of the app. Never import `window-store` from inside an app component.
5. Data access goes through the API: add a Nest module under `apps/api/src/modules/<name>/` (controller → service → Prisma),
   a Zod contract in `packages/contracts`, and authorise every query through the caller's workspace membership.
