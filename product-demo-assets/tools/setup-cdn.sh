#!/usr/bin/env bash
# Creates the CloudFront distribution for the /product-demo videos and lets
# it (and only it) read the private bucket's product-demo/ prefix.
#
#   AWS_REGION=ap-south-1 bash product-demo-assets/tools/setup-cdn.sh
#
# Already in place (2026-11-10):
#   - bucket praesto-product-demo-<account> (ap-south-1): all public access
#     blocked, owner-enforced, SSE-S3, tagged Project=praesto
#   - Origin Access Control "praesto-product-demo-oac"
# Blocked until AWS Support verifies the account for CloudFront
# ("Your account must be verified before you can add new CloudFront
# resources"). Run this once that's done. It's idempotent-ish: it refuses to
# create a second distribution if one with the same comment exists.
#
# Delivery settings:
#   - Managed cache policy CachingOptimized: honours each object's
#     Cache-Control (segments/thumbnails 1 year immutable, playlists and
#     subtitles 5 minutes; see upload.sh), gzip/brotli on.
#   - Managed response headers policy SimpleCORS: Access-Control-Allow-Origin
#     "*" for GET/HEAD. The content is public marketing video, sent without
#     credentials, so any origin may read it (praesto.in, previews, local dev).
#   - HTTPS only (HTTP redirects), HTTP/2 and HTTP/3, PriceClass_200 (includes
#     India edge locations). No custom domain: no DNS change.
set -euo pipefail
REGION=${AWS_REGION:-ap-south-1}
ACCT=$(aws sts get-caller-identity --query Account --output text)
BUCKET=praesto-product-demo-$ACCT
COMMENT="Praesto /product-demo HLS videos (private S3 via OAC)"

existing=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$COMMENT'].Id" --output text 2>/dev/null || true)
if [[ -n "$existing" && "$existing" != "None" ]]; then
  echo "Distribution already exists: $existing"; DIST_ID=$existing
else
  OAC=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='praesto-product-demo-oac'].Id" --output text)
  if [[ -z "$OAC" || "$OAC" == "None" ]]; then
    OAC=$(aws cloudfront create-origin-access-control --origin-access-control-config \
      "Name=praesto-product-demo-oac,Description=Praesto product demo videos,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
      --query OriginAccessControl.Id --output text)
  fi
  cfg=$(mktemp)
  cat >"$cfg" <<EOF
{
  "CallerReference": "praesto-product-demo-$(date +%s)",
  "Comment": "$COMMENT",
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "Origins": { "Quantity": 1, "Items": [ {
    "Id": "product-demo-s3",
    "DomainName": "$BUCKET.s3.$REGION.amazonaws.com",
    "OriginPath": "",
    "S3OriginConfig": { "OriginAccessIdentity": "" },
    "OriginAccessControlId": "$OAC"
  } ] },
  "DefaultCacheBehavior": {
    "TargetOriginId": "product-demo-s3",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 3, "Items": ["GET","HEAD","OPTIONS"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "ResponseHeadersPolicyId": "60669652-455b-4ae9-85a4-c4c02393f86c"
  }
}
EOF
  DIST_ID=$(aws cloudfront create-distribution --distribution-config "file://$cfg" --query Distribution.Id --output text)
  rm -f "$cfg"
  aws cloudfront tag-resource \
    --resource "arn:aws:cloudfront::$ACCT:distribution/$DIST_ID" \
    --tags 'Items=[{Key=Project,Value=praesto},{Key=Purpose,Value=product-demo-videos}]'
fi

# Only this distribution may read, and only under product-demo/.
policy=$(mktemp)
cat >"$policy" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CloudFrontReadsProductDemo",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/product-demo/*",
    "Condition": { "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::$ACCT:distribution/$DIST_ID" } }
  }]
}
EOF
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$policy"
rm -f "$policy"

DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" --query Distribution.DomainName --output text)
echo "Distribution $DIST_ID (deploying; ~5 min)"
echo "VITE_PRODUCT_DEMO_CDN_URL=https://$DOMAIN/product-demo"
