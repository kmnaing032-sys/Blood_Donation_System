
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError


password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """
    Convert plain password into Argon2 hash.
    """
    return password_hasher.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """
    Verify plain password against stored hash.
    """
    try:
        return password_hasher.verify(
            hashed_password,
            plain_password,
        )

    except (VerifyMismatchError, VerificationError):
        return False
