"""One-time migration for repositories created before account ownership existed.

Run locally after signing up. Preview first:
    python scripts/claim_legacy_repositories.py --email you@example.com
Apply only when this is a single-user local database you control:
    python scripts/claim_legacy_repositories.py --email you@example.com --apply
"""
import argparse

from app.db.mongo import get_db


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True, help='Email of the existing Evzax account to own legacy codebases')
    parser.add_argument('--apply', action='store_true', help='Actually assign unowned legacy codebases to this account')
    args = parser.parse_args()
    db = get_db()
    user = db.users.find_one({'email': args.email.strip().lower(), 'status': 'active'})
    if not user:
        raise SystemExit('Account not found. Create an account through Evzax first.')
    predicate = {'$or': [{'owner_id': {'$exists': False}}, {'owner_id': None}, {'owner_id': ''}]}
    count = db.repositories.count_documents(predicate)
    print(f'Account: {user["email"]}')
    print(f'Unowned legacy codebases: {count}')
    if not args.apply:
        print('Dry run only. Add --apply to assign these records after confirming this is your own single-user database.')
        return
    result = db.repositories.update_many(predicate, {'$set': {'owner_id': str(user['_id'])}})
    print(f'Assigned {result.modified_count} codebases to {user["email"]}.')
    print('This tool only updates repository ownership. Linked versions, files, documents and chat records remain in place.')


if __name__ == '__main__':
    main()
