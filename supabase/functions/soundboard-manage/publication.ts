export async function publishAfterObjectUpload<T>(
  uploadObject: () => Promise<void>,
  publishCatalogRow: () => Promise<T>,
  removeObject: () => Promise<void>,
): Promise<T> {
  await uploadObject();
  try {
    return await publishCatalogRow();
  } catch (caught) {
    try {
      await removeObject();
    } catch {
      // Keep the publication error stable; operators can reconcile an orphan.
    }
    throw caught;
  }
}
