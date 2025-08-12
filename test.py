import re


def extract_email_addresses(file_path):
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    emails = set()

    with open(file_path, 'r') as file:
        content = file.read()
        emails.update(re.findall(email_pattern, content))

    return list(emails)


if __name__ == "__main__":
   email = input("Enter an email address:")
   if email in extract_email_addresses('test.txt'):
       print("Email found in the file.")
