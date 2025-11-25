export async function onRequestGet(ctx) {
    try {
        const filePath = new URL(ctx.request.url).pathname.replace(
            "/releases/",
            "",
        );

        const file = await ctx.env.DOWNLOADS_BUCKET.get(filePath);
        if (file == null)
            return new Response("Release file not found", { status: 404 });

        const headers = {
            "Content-Type":
                file.httpMetadata?.contentType || "application/octet-stream",
            "Content-Length": file.size.toString(),
            "Cache-Control": "public, max-age=31536000, immutable",
        };

        // Add ETag if available for cache validation
        if (file.httpEtag) {
            headers["ETag"] = file.httpEtag;
        }

        const versionPattern = /v\d+\.\d+\.\d+/;
        const version = filePath.match(versionPattern)?.[0];
        const extension = filePath.split(".").pop();

        // Write download analytics (optional - don't fail if not configured)
        try {
            if (ctx.env.DOWNLOAD_ANALYTICS) {
                await ctx.env.DOWNLOAD_ANALYTICS.writeDataPoint({
                    blobs: ["total", filePath, version, extension],
                    doubles: [1],
                    indexes: ["download"],
                });
            }
        } catch (analyticsError) {
            console.error("Failed to write analytics:", analyticsError);
        }

        // Suggest filename for download
        const filename = filePath.split("/").pop();
        if (filename) {
            headers["Content-Disposition"] =
                `attachment; filename="${filename}"`;
        }

        return new Response(file.body, { headers });
    } catch (error) {
        console.error("Download error:", error);
        return new Response(`Internal server error: ${error.message}`, {
            status: 500,
        });
    }
}
