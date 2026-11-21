# Referencia de endpoints

Inventario generado a partir de los Route Handlers incluidos. Las rutas protegidas requieren cookies de sesión y las mutaciones requieren `Origin` coincidente con la URL del servidor. Los cuerpos y validaciones están definidos en `src/src/modules/*/*.schema.ts`.

| Métodos | Ruta |
|---|---|
| GET | `/api/admin/users` |
| GET | `/api/auth/callback` |
| POST | `/api/auth/change-password` |
| POST | `/api/auth/forgot-password` |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/register` |
| POST | `/api/auth/reset-password` |
| GET | `/api/debug/auth` |
| GET | `/api/health` |
| GET, PATCH | `/api/profiles/me` |
| POST | `/api/project-invitations/accept` |
| POST | `/api/projects/[id]/analysis/chat` |
| GET, PATCH, DELETE | `/api/projects/[id]/analysis/codes/[codeId]` |
| GET, POST | `/api/projects/[id]/analysis/codes` |
| GET | `/api/projects/[id]/analysis/codes/stats` |
| GET | `/api/projects/[id]/analysis/dashboard` |
| GET | `/api/projects/[id]/analysis/document-patterns` |
| DELETE | `/api/projects/[id]/analysis/insights/[insightId]/links/[linkId]` |
| GET, POST | `/api/projects/[id]/analysis/insights/[insightId]/links` |
| GET, PATCH, DELETE | `/api/projects/[id]/analysis/insights/[insightId]` |
| GET, POST | `/api/projects/[id]/analysis/insights` |
| DELETE | `/api/projects/[id]/analysis/memos/[memoId]/links/[linkId]` |
| GET, POST | `/api/projects/[id]/analysis/memos/[memoId]/links` |
| GET, PATCH, DELETE | `/api/projects/[id]/analysis/memos/[memoId]` |
| GET, POST | `/api/projects/[id]/analysis/memos` |
| GET | `/api/projects/[id]/analysis/overview` |
| GET | `/api/projects/[id]/analysis/relationships` |
| PATCH, DELETE | `/api/projects/[id]/analysis/segments/[segmentId]/codes/[segmentCodeId]` |
| GET, POST | `/api/projects/[id]/analysis/segments/[segmentId]/codes` |
| GET | `/api/projects/[id]/analysis/segments` |
| GET | `/api/projects/[id]/analysis/segments/uncoded` |
| POST | `/api/projects/[id]/delimitation/chat` |
| PATCH, DELETE | `/api/projects/[id]/delimitation/items/[itemId]` |
| POST | `/api/projects/[id]/delimitation/items` |
| POST | `/api/projects/[id]/delimitation/review` |
| GET, PATCH, PUT | `/api/projects/[id]/delimitation` |
| POST | `/api/projects/[id]/delimitation/versions/[versionId]/restore` |
| GET | `/api/projects/[id]/delimitation/versions/[versionId]` |
| GET, POST | `/api/projects/[id]/delimitation/versions` |
| POST | `/api/projects/[id]/documents/[documentId]/duplicate` |
| GET | `/api/projects/[id]/documents/[documentId]/export` |
| POST | `/api/projects/[id]/documents/[documentId]/restore` |
| GET, PATCH, DELETE | `/api/projects/[id]/documents/[documentId]` |
| GET, PATCH, DELETE | `/api/projects/[id]/documents/[documentId]/segments/[segmentId]` |
| GET, POST | `/api/projects/[id]/documents/[documentId]/segments` |
| POST | `/api/projects/[id]/documents/[documentId]/versions/[versionId]/restore` |
| GET | `/api/projects/[id]/documents/[documentId]/versions/[versionId]` |
| GET, POST | `/api/projects/[id]/documents/[documentId]/versions` |
| GET, POST | `/api/projects/[id]/documents` |
| GET, PATCH, DELETE | `/api/projects/[id]/documents/sources/[sourceId]` |
| GET, POST | `/api/projects/[id]/documents/sources` |
| GET | `/api/projects/[id]/documents/stats` |
| GET | `/api/projects/[id]/documents/trash` |
| GET | `/api/projects/[id]/exports/[exportType]` |
| GET, PATCH, DELETE | `/api/projects/[id]/participants/[participantId]` |
| GET, POST | `/api/projects/[id]/participants` |
| POST | `/api/projects/[id]/research-design/chat` |
| GET | `/api/projects/[id]/research-design/evaluate` |
| POST | `/api/projects/[id]/research-design/review` |
| GET, PATCH, PUT | `/api/projects/[id]/research-design` |
| PATCH, DELETE | `/api/projects/[id]/research-design/specific-objectives/[objectiveId]` |
| POST | `/api/projects/[id]/research-design/specific-objectives/reorder` |
| POST | `/api/projects/[id]/research-design/specific-objectives` |
| POST | `/api/projects/[id]/research-design/versions/[versionId]/restore` |
| GET | `/api/projects/[id]/research-design/versions/[versionId]` |
| GET, POST | `/api/projects/[id]/research-design/versions` |
| GET, PATCH, DELETE | `/api/projects/[id]` |
| POST | `/api/projects/[id]/sample-config/chat` |
| GET | `/api/projects/[id]/sample-config/options` |
| POST | `/api/projects/[id]/sample-config/review` |
| GET, PATCH, PUT | `/api/projects/[id]/sample-config` |
| POST | `/api/projects/[id]/sample-config/versions/[versionId]/restore` |
| GET | `/api/projects/[id]/sample-config/versions/[versionId]` |
| GET, POST | `/api/projects/[id]/sample-config/versions` |
| POST | `/api/projects/[id]/team/invitations/[invitationId]/revoke` |
| PATCH, DELETE | `/api/projects/[id]/team/members/[userId]` |
| POST | `/api/projects/[id]/team/presence` |
| GET, POST | `/api/projects/[id]/team` |
| GET | `/api/projects/[id]/workflow` |
| GET, POST | `/api/projects` |
| GET | `/api/supabase-ping` |
| GET, PATCH | `/api/users/me` |
