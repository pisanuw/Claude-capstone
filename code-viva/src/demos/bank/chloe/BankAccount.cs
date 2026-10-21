using System;
using System.Collections.Generic;

public class BankAccount
{
    private readonly List<string> history = new List<string>();

    public decimal Balance { get; private set; }

    public IReadOnlyList<string> History => history;

    public void Deposit(decimal amount)
    {
        RequirePositive(amount);
        Balance += amount;
        history.Add($"deposit {amount}");
    }

    public void Withdraw(decimal amount)
    {
        RequirePositive(amount);
        if (amount > Balance)
        {
            throw new InvalidOperationException("insufficient funds");
        }
        Balance -= amount;
        history.Add($"withdraw {amount}");
    }

    public void Transfer(BankAccount to, decimal amount)
    {
        if (to == null)
        {
            throw new ArgumentNullException(nameof(to));
        }
        if (ReferenceEquals(to, this))
        {
            throw new InvalidOperationException("cannot transfer to the same account");
        }
        Withdraw(amount);
        to.Deposit(amount);
        history.Add($"transfer {amount} out");
    }

    private static void RequirePositive(decimal amount)
    {
        if (amount <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amount), "amount must be positive");
        }
    }
}
